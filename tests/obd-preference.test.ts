import { describe, expect, it } from "vitest";
import {
  parseObdAdapterPreference,
  shouldShowObdConnectEntry,
  canStartObdBleConnect,
  refreshSensorsAction,
  formatObdPreferencePromptBlock,
  applyObdHonestyGuards,
  obdReplyClaimsLiveData,
  hasLiveObdAdapter,
} from "@/lib/obd-preference";

describe("has_obd_adapter preference", () => {
  it("defaults to false / unset", () => {
    const pref = parseObdAdapterPreference(null);
    expect(pref.hasObdAdapter).toBe(false);
    expect(pref.preferenceUnset).toBe(true);
    expect(shouldShowObdConnectEntry(pref)).toBe(false);
    expect(canStartObdBleConnect(pref)).toBe(false);
  });

  it("reads and shows Connect when explicitly enabled", () => {
    const pref = parseObdAdapterPreference({
      has_obd_adapter: true,
      has_obd_adapter_source: "self",
    });
    expect(pref.hasObdAdapter).toBe(true);
    expect(pref.preferenceUnset).toBe(false);
    expect(shouldShowObdConnectEntry(pref)).toBe(true);
    expect(canStartObdBleConnect(pref)).toBe(true);
  });

  it("hides Connect when user chose no", () => {
    const pref = parseObdAdapterPreference({
      has_obd_adapter: false,
      has_obd_adapter_source: "self",
    });
    expect(pref.preferenceUnset).toBe(false);
    expect(shouldShowObdConnectEntry(pref)).toBe(false);
  });

  it("Refresh Sensors: OFF → Settings; ON → Connect modal; live session → read", () => {
    expect(
      refreshSensorsAction({ hasObdAdapter: false, isConnected: false }),
    ).toBe("open_settings");
    expect(
      refreshSensorsAction({ hasObdAdapter: true, isConnected: false }),
    ).toBe("open_connect");
    expect(
      refreshSensorsAction({ hasObdAdapter: false, isConnected: true }),
    ).toBe("read");
    expect(
      refreshSensorsAction({ hasObdAdapter: true, isConnected: true }),
    ).toBe("read");
  });
});

describe("OBD honesty when adapter is off", () => {
  const noAdapter = parseObdAdapterPreference({
    has_obd_adapter: false,
    has_obd_adapter_source: "self",
  });
  const unset = parseObdAdapterPreference(null);

  it("prompt forbids pretending live/realtime OBD readings", () => {
    for (const pref of [noAdapter, unset]) {
      expect(hasLiveObdAdapter(pref)).toBe(false);
      const block = formatObdPreferencePromptBlock(pref);
      expect(block).toMatch(/user-provided/i);
      expect(block).toMatch(/Do not claim "live OBD data"/i);
      expect(block).not.toMatch(/You may mention reading codes with their scanner/);
    }
  });

  it("rewrites model output that claims live/realtime OBD", () => {
    const fake =
      "Based on live OBD readings and realtime OBD data, coolant is 210F.";
    expect(obdReplyClaimsLiveData(fake)).toBe(true);
    const out = applyObdHonestyGuards(fake, false);
    expect(obdReplyClaimsLiveData(out)).toBe(false);
    expect(out.toLowerCase()).toMatch(/user-provided/);
    expect(applyObdHonestyGuards(fake, true)).toBe(fake);
  });
});
