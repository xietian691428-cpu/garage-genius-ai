import { describe, expect, it } from "vitest";
import {
  parseObdAdapterPreference,
  shouldShowObdConnectEntry,
  canStartObdBleConnect,
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
});
