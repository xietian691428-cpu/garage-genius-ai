import { describe, expect, it } from "vitest";
import { OBDConnector } from "@/lib/obd";
import {
  canUseObdSimulator,
  requestSimulatedTransport,
} from "@/lib/obd-sim";

describe("OBD QA simulator", () => {
  it("allows only the primary QA email (and OBD_SIM env)", () => {
    expect(canUseObdSimulator("18565006079@163.com")).toBe(true);
    expect(canUseObdSimulator("owner@example.com")).toBe(false);
  });

  it("runs Camry happy-path through OBDConnector", async () => {
    const obd = new OBDConnector(async () =>
      requestSimulatedTransport({ scenario: "camry_2018" }),
    );
    const snap = await obd.readSessionSnapshot();
    expect(snap.connected).toBe(true);
    expect(snap.codes.map((c) => c.code)).toEqual(["P0171", "P0420"]);
    expect(snap.milOn).toBe(true);
    expect(snap.vin).toBe("4T1B11HK5JU123456");
  });

  it("maps ignition OFF to no_ecu", async () => {
    const obd = new OBDConnector();
    const result = await obd.connectDetailed({
      simScenario: "ignition_off",
      email: "18565006079@163.com",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("no_ecu");
      expect(result.message).toMatch(/ignition/i);
    }
  });

  it("maps occupied adapter to gatt-style failure", async () => {
    const obd = new OBDConnector();
    const result = await obd.connectDetailed({
      simScenario: "occupied",
      email: "18565006079@163.com",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("gatt");
      expect(result.message).toMatch(/other OBD apps/i);
    }
  });

  it("refuses sim for non-QA email", async () => {
    const obd = new OBDConnector();
    const result = await obd.connectDetailed({
      simScenario: "camry_2018",
      email: "someone@example.com",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("unsupported");
  });
});
