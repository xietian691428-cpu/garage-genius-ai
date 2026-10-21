import { describe, expect, it } from "vitest";
import {
  cleanElmLines,
  decodeDtcMessages,
  decodeFreezeFrameDtc,
  decodeMonitorStatus,
  decodePidValue,
  decodeSupportedPids,
  decodeVin,
  detectElmError,
  evaluateSmogReadiness,
  findPidBytes,
  isClearDtcAcknowledged,
  isClearDtcHardFailure,
  modelYearFromVin,
  parseAdapterVersion,
  parseAdapterVoltage,
  parseObdMessages,
  parseProtocolNumber,
  protocolInfo,
} from "@/lib/obd-protocol";

const CAN11 = protocolInfo("6");
const CAN29 = protocolInfo("7");
const ISO9141 = protocolInfo("3");

const codes = (raw: string, kind: "stored" | "pending" | "permanent", p = CAN11, headers = true) =>
  decodeDtcMessages(parseObdMessages(raw, { protocol: p, headers }), kind, p).map(
    (d) => d.code,
  );

describe("Mode 04 clear acknowledgement", () => {
  it("accepts CAN positive response 44 and bare OK", () => {
    const can = parseObdMessages("7E8 01 44\r\r>", {
      protocol: CAN11,
      headers: true,
      command: "04",
    });
    expect(isClearDtcAcknowledged("7E8 01 44\r\r>", can)).toBe(true);
    expect(isClearDtcAcknowledged("OK\r\r>", [])).toBe(true);
  });

  it("treats UNABLE TO CONNECT as a hard failure", () => {
    expect(isClearDtcHardFailure("SEARCHING...\rUNABLE TO CONNECT\r\r>")).toBe(
      true,
    );
    expect(isClearDtcHardFailure("7E8 01 44\r\r>")).toBe(false);
  });
});

describe("ELM327 DTC decoding", () => {
  it("skips the CAN DTC-count byte (P0171 was misread as P0101)", () => {
    expect(codes("7E8 04 43 01 01 71 \r\r>", "stored")).toEqual(["P0171"]);
    expect(codes("7E8 06 43 02 01 71 03 00 \r\r>", "stored")).toEqual(["P0171", "P0300"]);
  });

  it("decodes header-less CAN replies, with and without a known protocol", () => {
    expect(codes("43 01 01 71\r\r>", "stored", CAN11, false)).toEqual(["P0171"]);
    expect(codes("43 02 01 71 03 00\r\r>", "stored", null, false)).toEqual(["P0171", "P0300"]);
  });

  it("decodes legacy (non-CAN) replies without a count byte", () => {
    expect(codes("48 6B 10 43 01 71 00 00 00 00 9C\r\r>", "stored", ISO9141)).toEqual(["P0171"]);
    expect(codes("43 01 71 00 00 00 00\r\r>", "stored", null, false)).toEqual(["P0171"]);
    expect(
      codes(
        "48 6B 10 43 01 71 03 00 04 20 AA\r48 6B 10 43 01 33 00 00 00 00 BB\r\r>",
        "stored",
        ISO9141,
      ),
    ).toEqual(["P0171", "P0300", "P0420", "P0133"]);
  });

  it("keeps codes from every ECU (engine + transmission)", () => {
    const msgs = parseObdMessages("7E9 04 43 01 07 00\r7E8 04 43 01 01 71\r\r>", {
      protocol: CAN11,
    });
    const out = decodeDtcMessages(msgs, "stored", CAN11);
    expect(out).toEqual([
      { code: "P0171", ecu: "7E8", kind: "stored" },
      { code: "P0700", ecu: "7E9", kind: "stored" },
    ]);
  });

  it("reassembles multi-frame CAN replies (4+ codes)", () => {
    const raw = "7E8 10 0A 43 04 01 71 03 00\r7E8 21 04 20 01 33 00 00 00\r\r>";
    expect(codes(raw, "stored")).toEqual(["P0171", "P0300", "P0420", "P0133"]);
  });

  it("reads pending (Mode 07) and permanent (Mode 0A) codes", () => {
    expect(codes("7E8 04 47 01 04 20\r\r>", "pending")).toEqual(["P0420"]);
    expect(codes("7E8 04 4A 01 04 20\r\r>", "permanent")).toEqual(["P0420"]);
    // A Mode 03 reply must not be read as pending
    expect(codes("7E8 04 43 01 04 20\r\r>", "pending")).toEqual([]);
  });

  it("handles no codes, 29-bit CAN, and spaces-off output", () => {
    expect(codes("7E8 02 43 00\r\r>", "stored")).toEqual([]);
    expect(codes("18 DA F1 10 04 43 01 01 71\r\r>", "stored", CAN29)).toEqual(["P0171"]);
    expect(codes("7E806430201710300\r\r>", "stored")).toEqual(["P0171", "P0300"]);
    expect(codes("18DAF1100443010171\r\r>", "stored", CAN29)).toEqual(["P0171"]);
  });

  it("decodes chassis / body / network letters", () => {
    expect(codes("7E8 08 43 03 41 23 81 23 C1 00\r\r>", "stored")).toEqual([
      "C0123",
      "B0123",
      "U0100",
    ]);
  });
});

describe("ELM327 cleanup and errors", () => {
  it("drops SEARCHING, BUS INIT, echo and prompt", () => {
    expect(
      cleanElmLines("0100\rSEARCHING...\r7E8 06 41 00 BE 3E B8 11\r\r>", "0100"),
    ).toEqual(["7E8 06 41 00 BE 3E B8 11"]);
    expect(cleanElmLines("BUS INIT: ...OK\r48 6B 10 41 00 BE 3E B8 11 AA\r>")).toEqual([
      "OK",
      "48 6B 10 41 00 BE 3E B8 11 AA",
    ]);
  });

  it("detects adapter errors", () => {
    expect(detectElmError("SEARCHING...\rUNABLE TO CONNECT\r\r>")).toBe("unable_to_connect");
    expect(detectElmError("NO DATA\r\r>")).toBe("no_data");
    expect(detectElmError("?\r\r>")).toBe("unknown_command");
    expect(detectElmError("CAN ERROR\r>")).toBe("can_error");
    expect(detectElmError("7E8 02 43 00\r>")).toBeNull();
  });

  it("parses protocol, voltage and version", () => {
    expect(parseProtocolNumber("A6\r\r>")?.label).toContain("CAN (11 bit, 500");
    expect(parseProtocolNumber("3\r>")?.can).toBe(false);
    expect(parseProtocolNumber("A7\r>")?.extendedCan).toBe(true);
    expect(parseAdapterVoltage("12.4V\r\r>")).toBe(12.4);
    expect(parseAdapterVoltage("?\r>")).toBeNull();
    expect(parseAdapterVersion("\r\rELM327 v1.5\r\r>")).toBe("ELM327 v1.5");
  });
});

describe("Mode 01 PIDs", () => {
  it("decodes the supported-PID bitmap", () => {
    const msgs = parseObdMessages("7E8 06 41 00 BE 3E B8 11\r\r>", { protocol: CAN11 });
    const set = decodeSupportedPids(msgs, 0x00);
    expect([...set].sort((a, b) => a - b)).toEqual([
      0x01, 0x03, 0x04, 0x05, 0x06, 0x07, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x11, 0x13,
      0x14, 0x15, 0x1c, 0x20,
    ]);
  });

  it("decodes common values with SAE scaling", () => {
    const rpm = findPidBytes(parseObdMessages("7E8 04 41 0C 1A F8\r>", { protocol: CAN11 }), 0x0c);
    expect(decodePidValue(0x0c, rpm!)).toBe(1726);
    expect(decodePidValue(0x05, [0x7b])).toBe(83);
    expect(decodePidValue(0x42, [0x37, 0x6e])).toBe(14.19);
    expect(decodePidValue(0x06, [0x80])).toBe(0);
    expect(decodePidValue(0x07, [0x8a])).toBe(7.8);
  });

  it("scales odometer PID A6 in 0.1 km", () => {
    const bytes = findPidBytes(
      parseObdMessages("7E8 06 41 A6 00 0F 42 40\r>", { protocol: CAN11 }),
      0xa6,
    );
    expect(decodePidValue(0xa6, bytes!)).toBe(100000);
  });

  it("decodes legacy PID replies after stripping header and checksum", () => {
    const msgs = parseObdMessages("48 6B 10 41 0C 1A F8 33\r>", { protocol: ISO9141 });
    expect(decodePidValue(0x0c, findPidBytes(msgs, 0x0c)!)).toBe(1726);
  });
});

describe("Readiness monitors and smog estimate", () => {
  it("decodes MIL, DTC count and supported monitors", () => {
    const r = decodeMonitorStatus([0x81, 0x07, 0x65, 0x04])!;
    expect(r.milOn).toBe(true);
    expect(r.dtcCount).toBe(1);
    expect(r.ignition).toBe("spark");
    expect(r.monitors.map((m) => `${m.id}:${m.ready ? "ready" : "inc"}`)).toEqual([
      "misfire:ready",
      "fuel_system:ready",
      "components:ready",
      "catalyst:ready",
      "evap:inc",
      "o2_sensor:ready",
      "o2_heater:ready",
    ]);
    expect(evaluateSmogReadiness(r, 2018).verdict).toBe("mil_on");
  });

  it("applies the 2001+ (1 incomplete) and 1996–2000 (2 incomplete) rules", () => {
    const oneInc = decodeMonitorStatus([0x00, 0x07, 0x65, 0x04]);
    expect(evaluateSmogReadiness(oneInc, 2018).verdict).toBe("ready");
    const twoInc = decodeMonitorStatus([0x00, 0x07, 0x65, 0x05]);
    expect(evaluateSmogReadiness(twoInc, 2018).verdict).toBe("not_ready");
    expect(evaluateSmogReadiness(twoInc, 1999).verdict).toBe("ready");
    expect(evaluateSmogReadiness(twoInc, null).verdict).toBe("not_ready");
    expect(evaluateSmogReadiness(twoInc, 1994).verdict).toBe("unknown");
  });

  it("uses diesel monitor names for compression-ignition engines", () => {
    const r = decodeMonitorStatus([0x00, 0x0f, 0xc2, 0x40])!;
    expect(r.ignition).toBe("compression");
    expect(r.monitors.filter((m) => !m.continuous).map((m) => m.id)).toEqual([
      "nox_scr",
      "pm_filter",
      "egr_vvt",
    ]);
    expect(r.monitors.find((m) => m.id === "pm_filter")?.ready).toBe(false);
  });
});

describe("VIN (Mode 09 PID 02)", () => {
  const VIN = "1G1JC5444R7252367";

  it("reads a CAN multi-frame VIN with headers", () => {
    const raw =
      "7E8 10 14 49 02 01 31 47 31\r7E8 21 4A 43 35 34 34 34 52\r7E8 22 37 32 35 32 33 36 37\r\r>";
    expect(decodeVin(parseObdMessages(raw, { protocol: CAN11 }))).toBe(VIN);
  });

  it("reads a header-less CAN multi-frame VIN", () => {
    const raw = "014\r0: 49 02 01 31 47 31\r1: 4A 43 35 34 34 34 52\r2: 37 32 35 32 33 36 37\r\r>";
    expect(decodeVin(parseObdMessages(raw, { protocol: CAN11, headers: false }))).toBe(VIN);
  });

  it("reads a legacy 5-frame VIN", () => {
    const raw = [
      "48 6B 10 49 02 01 00 00 00 31 AA",
      "48 6B 10 49 02 02 47 31 4A 43 AA",
      "48 6B 10 49 02 03 35 34 34 34 AA",
      "48 6B 10 49 02 04 52 37 32 35 AA",
      "48 6B 10 49 02 05 32 33 36 37 AA",
    ].join("\r");
    expect(decodeVin(parseObdMessages(raw, { protocol: ISO9141 }))).toBe(VIN);
  });

  it("returns null for NO DATA", () => {
    expect(decodeVin(parseObdMessages("NO DATA\r>", { protocol: CAN11 }))).toBeNull();
  });

  it("derives model year from VIN positions 7 and 10", () => {
    expect(modelYearFromVin(VIN)).toBe(1994);
    expect(modelYearFromVin("4T1B11HK5JU123456")).toBe(2018);
    expect(modelYearFromVin("bad")).toBeNull();
  });
});

describe("Freeze frame (Mode 02)", () => {
  it("reads the DTC that stored the frame and frame values", () => {
    const dtcMsgs = parseObdMessages("7E8 05 42 02 00 01 71\r>", { protocol: CAN11 });
    expect(decodeFreezeFrameDtc(dtcMsgs)).toBe("P0171");
    const cool = findPidBytes(
      parseObdMessages("7E8 04 42 05 00 7B\r>", { protocol: CAN11 }),
      0x05,
      0x02,
    );
    expect(decodePidValue(0x05, cool!)).toBe(83);
  });
});
