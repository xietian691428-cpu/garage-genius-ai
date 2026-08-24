/**
 * Structured OBD-II Bluetooth session types (Web Bluetooth / Capacitor WebView).
 * Keep sensor/DTC shapes here to avoid circular imports with lib/obd.ts.
 */

export type ObdSessionDtc = {
  code: string;
  desc: string;
  severity: "Info" | "Low" | "Moderate" | "High";
};

export type ObdSessionSensors = {
  at: string;
  coolantC: number | null;
  rpm: number | null;
  speedKph: number | null;
  voltage: number | null;
  oilTempC: number | null;
  throttlePct: number | null;
};

export type ObdConnectErrorCode =
  | "unsupported"
  | "capacitor_ios"
  | "cancelled"
  | "permission"
  | "gatt"
  | "service"
  | "timeout"
  | "unknown";

export type ObdConnectResult =
  | { ok: true; deviceName: string }
  | { ok: false; code: ObdConnectErrorCode; message: string };

/** Full DIY snapshot after connect + read. */
export type ObdSessionSnapshot = {
  at: string;
  deviceName: string;
  connected: boolean;
  codes: ObdSessionDtc[];
  sensors: ObdSessionSensors;
  /** Mode 01 PID A6 when ECU exposes it (km). */
  odometerKm: number | null;
  /** Mode 01 PID 31 — distance since codes cleared (km). */
  distanceSinceCodesClearedKm: number | null;
  note: string;
  /** Soft failures (PID unsupported, etc.) — scan may still succeed. */
  warnings: string[];
};

export type ObdCompatibleDevice = {
  id: string;
  name: string;
  notes: string;
};

export const OBD_COMPATIBLE_DEVICES: ObdCompatibleDevice[] = [
  {
    id: "veepeak",
    name: "Veepeak OBDCheck BLE / Mini",
    notes: "BLE only — Nordic UART; compatible with BLE ELM327 adapters.",
  },
  {
    id: "obdlink",
    name: "OBDLink MX+ / CX (BLE mode)",
    notes: "BLE mode required — Classic pairing is not supported in the browser.",
  },
  {
    id: "generic-elm",
    name: "Generic ELM327 BLE (v1.5 clones)",
    notes: "Must be BLE / 4.0+. Classic Bluetooth ELM327 dongles are not supported.",
  },
  {
    id: "carista",
    name: "Carista / similar BLE dongles",
    notes: "BLE GATT serial only; firmware quality varies.",
  },
];
