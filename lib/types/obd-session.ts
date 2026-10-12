/**
 * Structured OBD-II session types shared by the connector, modal, Chat,
 * Coach and Dashboard. Keep sensor/DTC shapes here to avoid circular imports
 * with lib/obd.ts.
 */

import type {
  DtcKind,
  ObdReadiness,
  PidUnit,
  SmogReadiness,
} from "@/lib/obd-protocol";

export type ObdSessionDtc = {
  code: string;
  desc: string;
  severity: "Info" | "Low" | "Moderate" | "High";
  /** Mode 03 stored, 07 pending, 0A permanent */
  kind?: DtcKind;
  /** Responding module id (7E8 engine, 7E9 transmission, …) */
  ecu?: string;
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
  | "adapter_silent"
  | "no_ecu"
  | "disconnected"
  | "unknown";

export type ObdConnectResult =
  | { ok: true; deviceName: string }
  | { ok: false; code: ObdConnectErrorCode; message: string };

export type ObdFreezeFrame = {
  /** DTC that stored the freeze frame */
  dtc: string | null;
  values: Array<{ pid: number; label: string; value: number; unit: PidUnit }>;
};

export type ObdAdapterSummary = {
  /** "ELM327 v1.5", "STN2120 …" */
  version: string | null;
  /** "ISO 15765-4 CAN (11 bit, 500 kbaud)" */
  protocol: string | null;
  /** ATRV — battery voltage at the OBD port */
  batteryVoltage: number | null;
};

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
  /** Check-engine light commanded on by the ECU (PID 01). */
  milOn?: boolean | null;
  readiness?: ObdReadiness | null;
  /** Estimate from readiness + model year (VIN-derived when available). */
  smog?: SmogReadiness | null;
  freezeFrame?: ObdFreezeFrame | null;
  /** Mode 09 VIN — never put the full VIN in AI prompts (use maskVin). */
  vin?: string | null;
  adapter?: ObdAdapterSummary | null;
};

export type ObdCompatibleDevice = {
  id: string;
  name: string;
  notes: string;
};

/** Adapters that speak the open ELM327 command set over Bluetooth LE. */
export const OBD_COMPATIBLE_DEVICES: ObdCompatibleDevice[] = [
  {
    id: "veepeak",
    name: "Veepeak OBDCheck BLE / BLE+",
    notes: "Bluetooth LE. Works in Chrome.",
  },
  {
    id: "obdlink-cx",
    name: "OBDLink CX",
    notes: "Bluetooth LE model. (OBDLink LX / MX+ are Classic Bluetooth.)",
  },
  {
    id: "vgate",
    name: "Vgate iCar Pro BLE / vLinker BLE",
    notes: "Use the BLE / “4.0” version, not the Wi-Fi or Classic version.",
  },
  {
    id: "generic-elm",
    name: "Generic ELM327 Bluetooth 4.0 / BLE",
    notes: "Packaging should say BLE, Bluetooth 4.0+, or works with iPhone.",
  },
];

/** Closed-ecosystem scanners that only talk to their own apps. */
export const OBD_LOCKED_DEVICES = [
  "BlueDriver",
  "FIXD",
  "Carly",
  "Carista",
  "Innova RepairSolutions",
  "Autel / Launch handhelds",
] as const;
