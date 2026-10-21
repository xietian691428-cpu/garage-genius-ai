import { describe, expect, it } from "vitest";
import { OBDConnector } from "@/lib/obd";
import type { ObdTransport } from "@/lib/obd-transport";

/** Scripted ELM327: unknown AT → OK, unknown OBD request → NO DATA. */
class FakeElm implements ObdTransport {
  readonly kind = "mock" as const;
  readonly deviceName = "OBDII";
  connected = true;
  sent: string[] = [];
  private data = new Set<(chunk: string) => void>();
  private dc = new Set<() => void>();

  constructor(
    private replies: Record<string, string | string[]>,
    private chunkSize = 0,
  ) {}

  async write(text: string): Promise<void> {
    const cmd = text.trim();
    this.sent.push(cmd);
    const scripted = this.replies[cmd];
    // Arrays script successive replies (e.g. first 0100 fails, second works)
    const reply = Array.isArray(scripted)
      ? (scripted.length > 1 ? scripted.shift() : scripted[0])
      : scripted;
    const out = reply ?? (cmd.startsWith("AT") ? "OK\r\r>" : "NO DATA\r\r>");
    const chunks =
      this.chunkSize > 0
        ? out.match(new RegExp(`[\\s\\S]{1,${this.chunkSize}}`, "g")) ?? []
        : [out];
    chunks.forEach((c, i) => setTimeout(() => this.data.forEach((l) => l(c)), i));
  }

  onData(listener: (chunk: string) => void) {
    this.data.add(listener);
    return () => this.data.delete(listener);
  }

  onDisconnect(listener: () => void) {
    this.dc.add(listener);
    return () => this.dc.delete(listener);
  }

  disconnect() {
    this.connected = false;
  }
}

const connectorFor = (elm: FakeElm) => new OBDConnector(async () => elm);

const CAMRY_2018: Record<string, string | string[]> = {
  ATZ: "\r\rELM327 v1.5\r\r>",
  ATRV: "12.6V\r\r>",
  "0100": "SEARCHING...\r7E8 06 41 00 BE 3E B8 13\r7E9 06 41 00 98 18 80 01\r\r>",
  "0120": "7E8 06 41 20 80 01 A0 01\r\r>",
  "0140": "7E8 06 41 40 40 00 00 01\r\r>",
  "0160": "7E8 06 41 60 00 00 00 01\r\r>",
  "0180": "7E8 06 41 80 00 00 00 01\r\r>",
  "01A0": "7E8 06 41 A0 04 00 00 00\r\r>",
  ATDPN: "A6\r\r>",
  "0101": "7E8 06 41 01 81 07 65 04\r\r>",
  "03": "7E8 04 43 01 01 71\r\r>",
  "07": "7E8 04 47 01 04 20\r7E9 02 47 00\r\r>",
  "0A": "7E8 04 4A 01 01 71\r\r>",
  "020200": "7E8 05 42 02 00 01 71\r\r>",
  "020400": "7E8 04 42 04 00 66\r\r>",
  "020500": "7E8 04 42 05 00 7B\r\r>",
  "020C00": "7E8 05 42 0C 00 0B B8\r\r>",
  "0105": "7E8 03 41 05 7B\r\r>",
  "010C": "7E8 04 41 0C 0B B8\r\r>",
  "010D": "7E8 03 41 0D 00\r\r>",
  "0111": "7E8 03 41 11 26\r\r>",
  "0142": "7E8 04 41 42 37 6E\r\r>",
  "0131": "7E8 04 41 31 01 F4\r\r>",
  "01A6": "7E8 06 41 A6 00 04 4A 5C\r\r>",
  "0902":
    "7E8 10 14 49 02 01 34 54 31\r7E8 21 42 31 31 48 4B 35 4A\r7E8 22 55 31 32 33 34 35 36\r\r>",
};

describe("OBD session against a simulated ELM327", () => {
  it("reads a 2018 CAN car end to end", async () => {
    const elm = new FakeElm({ ...CAMRY_2018 });
    const obd = connectorFor(elm);
    const steps: string[] = [];
    const snap = await obd.readSessionSnapshot({ onStep: (s) => steps.push(s) });

    expect(snap.connected).toBe(true);
    expect(snap.codes.map((c) => `${c.code}:${c.kind}`)).toEqual([
      "P0171:stored",
      "P0420:pending",
    ]);
    expect(snap.milOn).toBe(true);
    expect(snap.readiness?.monitors.find((m) => m.id === "evap")?.ready).toBe(false);
    expect(snap.smog?.verdict).toBe("mil_on");
    expect(snap.freezeFrame?.dtc).toBe("P0171");
    expect(snap.freezeFrame?.values.map((v) => [v.label, v.value])).toEqual([
      ["Engine load", 40],
      ["Coolant", 83],
      ["RPM", 750],
    ]);
    expect(snap.sensors).toMatchObject({
      coolantC: 83,
      rpm: 750,
      speedKph: 0,
      throttlePct: 15,
      voltage: 14.19,
      oilTempC: null,
    });
    expect(snap.odometerKm).toBe(28118);
    expect(snap.distanceSinceCodesClearedKm).toBe(500);
    expect(snap.vin).toBe("4T1B11HK5JU123456");
    expect(snap.adapter).toEqual({
      version: "ELM327 v1.5",
      protocol: "ISO 15765-4 CAN (11 bit, 500 kbaud)",
      batteryVoltage: 12.6,
    });
    expect(steps).toEqual([
      "init",
      "search",
      "readiness",
      "codes",
      "freeze_frame",
      "sensors",
      "vin",
    ]);
    // Unsupported PIDs are skipped instead of timing out
    expect(elm.sent).not.toContain("015C");
    expect(elm.sent.slice(0, 7)).toEqual(["ATZ", "ATE0", "ATL0", "ATS1", "ATH1", "ATAT1", "ATSP0"]);
  });

  it("survives replies split into small BLE chunks", async () => {
    const elm = new FakeElm({ ...CAMRY_2018 }, 5);
    const snap = await connectorFor(elm).readSessionSnapshot();
    expect(snap.codes.map((c) => c.code)).toEqual(["P0171", "P0420"]);
    expect(snap.vin).toBe("4T1B11HK5JU123456");
  });

  it("reads an older ISO 9141 (K-line) car", async () => {
    const elm = new FakeElm({
      ATZ: "ELM327 v2.1\r\r>",
      "0100": "SEARCHING...\rBUS INIT: ...OK\r48 6B 10 41 00 BE 1F B8 10 AA\r\r>",
      ATDPN: "A3\r\r>",
      "0101": "48 6B 10 41 01 82 07 65 00 AA\r\r>",
      "03": "48 6B 10 43 01 71 03 00 00 00 AA\r\r>",
      "0105": "48 6B 10 41 05 7B AA\r\r>",
      "0902": [
        "48 6B 10 49 02 01 00 00 00 31 AA",
        "48 6B 10 49 02 02 47 31 4A 43 AA",
        "48 6B 10 49 02 03 35 34 34 34 AA",
        "48 6B 10 49 02 04 52 37 32 35 AA",
        "48 6B 10 49 02 05 32 33 36 37 AA",
      ].join("\r") + "\r\r>",
    });
    const snap = await connectorFor(elm).readSessionSnapshot();
    expect(snap.connected).toBe(true);
    expect(snap.adapter?.protocol).toBe("ISO 9141-2");
    expect(snap.codes.map((c) => c.code)).toEqual(["P0171", "P0300"]);
    expect(snap.readiness?.dtcCount).toBe(2);
    expect(snap.sensors.coolantC).toBe(83);
    expect(snap.vin).toBe("1G1JC5444R7252367");
    // 1994 model year → pre-OBD-II, no smog estimate
    expect(snap.smog?.verdict).toBe("unknown");
  });

  it("handles clones that ignore headers (ATH1 → ?)", async () => {
    const elm = new FakeElm({
      ATZ: "ELM327 v1.5\r\r>",
      ATH1: "?\r\r>",
      "0100": "41 00 BE 3E B8 11\r\r>",
      ATDPN: "6\r\r>",
      "03": "43 02 01 71 03 00\r\r>",
    });
    const snap = await connectorFor(elm).readSessionSnapshot();
    expect(snap.codes.map((c) => c.code)).toEqual(["P0171", "P0300"]);
  });

  it("falls back to header-less parsing when ATH1 is accepted but ignored", async () => {
    const elm = new FakeElm({
      ATZ: "ELM327 v1.5\r\r>",
      "0100": "41 00 BE 3E B8 11\r\r>",
      ATDPN: "A6\r\r>",
      "03": "43 01 01 71\r\r>",
    });
    const snap = await connectorFor(elm).readSessionSnapshot();
    expect(snap.codes.map((c) => c.code)).toEqual(["P0171"]);
  });

  it("retries the protocol search once before giving up", async () => {
    const elm = new FakeElm({
      ATZ: "ELM327 v1.5\r\r>",
      "0100": ["SEARCHING...\rUNABLE TO CONNECT\r\r>", "7E8 06 41 00 BE 3E B8 11\r\r>"],
      ATDPN: "A6\r\r>",
    });
    const res = await connectorFor(elm).connectDetailed();
    expect(res.ok).toBe(true);
  });

  it("reports ignition-off / no ECU clearly", async () => {
    const elm = new FakeElm({
      ATZ: "ELM327 v1.5\r\r>",
      "0100": "SEARCHING...\rUNABLE TO CONNECT\r\r>",
    });
    const res = await connectorFor(elm).connectDetailed();
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("no_ecu");
      expect(res.message).toMatch(/ignition/i);
    }
  });

  it("flags adapters that connect but don't speak ELM327", async () => {
    const elm = new FakeElm({ ATZ: "\r>", ATI: ">" });
    const res = await connectorFor(elm).connectDetailed();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("adapter_silent");
  });

  it("clears stored codes with Mode 04 then re-reads an empty snapshot", async () => {
    const elm = new FakeElm({
      ...CAMRY_2018,
      "04": "7E8 01 44\r\r>",
      // After clear: stored empty; permanent may remain once then empty on re-scan
      "03": ["7E8 04 43 01 01 71\r\r>", "7E8 02 43 00\r\r>"],
      "07": ["7E8 04 47 01 04 20\r7E9 02 47 00\r\r>", "7E8 02 47 00\r\r>"],
      "0A": ["7E8 04 4A 01 01 71\r\r>", "7E8 02 4A 00\r\r>"],
      "0101": [
        "7E8 06 41 01 81 07 65 04\r\r>",
        "7E8 06 41 01 00 07 65 00\r\r>",
      ],
    });
    const obd = connectorFor(elm);
    const before = await obd.readSessionSnapshot();
    expect(before.codes.some((c) => c.code === "P0171")).toBe(true);

    const cleared = await obd.clearFaultCodes();
    expect(cleared.ok).toBe(true);
    expect(elm.sent).toContain("04");
    expect(cleared.remainingStored).toBe(0);
    expect(cleared.snapshot?.codes.filter((c) => c.kind === "stored")).toEqual(
      [],
    );
  });

  it("refuses clear when not connected", async () => {
    const obd = connectorFor(new FakeElm({ ...CAMRY_2018 }));
    const res = await obd.clearFaultCodes();
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/not connected/i);
  });
});
