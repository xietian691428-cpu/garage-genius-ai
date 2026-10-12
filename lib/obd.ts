/**
 * OBD-II connector for garage DIY scans: transport (Web Bluetooth today) →
 * ELM327 session (`lib/obd-elm.ts`) → structured `ObdSessionSnapshot`.
 *
 * Decoding rules live in `lib/obd-protocol.ts`. Never invent readings — a
 * failed or unsupported read leaves fields null.
 */

import { lookupDtc } from "@/lib/dtc";
import { ElmSession, ObdSessionError, type ObdScanStep } from "@/lib/obd-elm";
import {
  evaluateSmogReadiness,
  modelYearFromVin,
} from "@/lib/obd-protocol";
import {
  WebBluetoothTransport,
  isWebBluetoothAvailable,
  type ObdTransport,
} from "@/lib/obd-transport";
import { formatObdValue, type ObdUnitSystem } from "@/lib/obd-units";
import { getCapacitorPlatform } from "@/lib/native-platform";
import type {
  ObdConnectErrorCode,
  ObdConnectResult,
  ObdSessionDtc,
  ObdSessionSnapshot,
} from "@/lib/types/obd-session";

export { isWebBluetoothAvailable };
export type { ObdScanStep };

/** Best-effort Mode 01 live values for Dashboard sensors panel */
export type ObdLiveSensors = {
  at: string;
  coolantC: number | null;
  rpm: number | null;
  speedKph: number | null;
  voltage: number | null;
  oilTempC: number | null;
  throttlePct: number | null;
};

/**
 * Dashboard live PID set (Mode 01). Values are metric numbers — UI converts
 * and adds units via `formatLiveSensorValue`.
 */
export const LIVE_SENSOR_PIDS: ReadonlyArray<{
  key: keyof Omit<ObdLiveSensors, "at">;
  pid: string;
  label: string;
  unit: string;
}> = [
  { key: "coolantC", pid: "05", label: "Coolant", unit: "°C" },
  { key: "rpm", pid: "0C", label: "RPM", unit: "" },
  { key: "speedKph", pid: "0D", label: "Speed", unit: "km/h" },
  { key: "throttlePct", pid: "11", label: "Throttle", unit: "%" },
  { key: "voltage", pid: "42", label: "Voltage", unit: "V" },
  { key: "oilTempC", pid: "5C", label: "Oil temp", unit: "°C" },
];

const LIVE_PID_NUMBERS = LIVE_SENSOR_PIDS.map((p) => parseInt(p.pid, 16));

export function emptyLiveSensors(): ObdLiveSensors {
  return {
    at: new Date().toISOString(),
    coolantC: null,
    rpm: null,
    speedKph: null,
    voltage: null,
    oilTempC: null,
    throttlePct: null,
  };
}

export function hasLiveSensorData(sensors: ObdLiveSensors | null): boolean {
  if (!sensors) return false;
  return LIVE_SENSOR_PIDS.some(({ key }) => sensors[key] != null);
}

/** Format a metric PID value for display (°F / mph by default for US owners). */
export function formatLiveSensorValue(
  value: number | null,
  unit: string,
  system: ObdUnitSystem = "imperial",
): string {
  return formatObdValue(value, unit, system);
}

function sensorsFromPids(pids: Map<number, number>): ObdLiveSensors {
  const sensors = emptyLiveSensors();
  for (const { key, pid } of LIVE_SENSOR_PIDS) {
    const v = pids.get(parseInt(pid, 16));
    if (v != null) sensors[key] = v;
  }
  return sensors;
}

/**
 * Whether live OBD can be attempted in this runtime. Store apps need the
 * native Bluetooth bridge (next app release); WKWebView / Android WebView do
 * not expose Web Bluetooth.
 */
export function getObdRuntimeSupport(): {
  supported: boolean;
  code: ObdConnectErrorCode | null;
  message: string;
} {
  const platform = getCapacitorPlatform();
  if (platform === "ios") {
    return {
      supported: false,
      code: "capacitor_ios",
      message:
        "Live Bluetooth OBD is not available in this iPhone and iPad app version. Enter the fault code manually or upload an OBD screenshot.",
    };
  }
  if (!isWebBluetoothAvailable()) {
    return {
      supported: false,
      code: "unsupported",
      message:
        platform === "android"
          ? "Live Bluetooth OBD is not available in this app version yet. Enter the fault code manually or upload an OBD screenshot."
          : "Bluetooth is not available in this browser. Try Chrome, or enter the fault code / upload an OBD screenshot.",
    };
  }
  return { supported: true, code: null, message: "" };
}

function mapConnectError(err: unknown): ObdConnectResult {
  if (err instanceof ObdSessionError) {
    const messages: Record<ObdSessionError["code"], string> = {
      adapter_silent:
        "Connected over Bluetooth, but the adapter didn't answer. It may not be an ELM327-compatible scanner (BlueDriver, FIXD, Carly and similar only work with their own apps). Unplug it for 10 seconds and try again.",
      no_ecu:
        "The adapter is working, but the car didn't answer. Turn the ignition to ON (or start the engine), push the adapter firmly into the port, wait 10 seconds, then try again.",
      disconnected:
        "The adapter disconnected. Keep the phone near the car and make sure no other app is connected to the adapter.",
    };
    return { ok: false, code: err.code, message: messages[err.code] };
  }

  const name =
    err && typeof err === "object" && "name" in err
      ? String((err as { name?: string }).name)
      : "";
  const msg = err instanceof Error ? err.message : String(err ?? "Unknown error");
  if (name === "NotFoundError" || /cancel/i.test(msg)) {
    return {
      ok: false,
      code: "cancelled",
      message:
        "No adapter was selected. Make sure it's plugged in and the ignition is ON. If it isn't listed, tap “My adapter isn't listed”.",
    };
  }
  if (name === "SecurityError" || name === "NotAllowedError" || /permission|not allowed/i.test(msg)) {
    return {
      ok: false,
      code: "permission",
      message: "Bluetooth permission was denied. Allow Bluetooth for this site and retry.",
    };
  }
  if (/No compatible OBD|characteristic|service/i.test(msg)) {
    return {
      ok: false,
      code: "service",
      message:
        "This device doesn't offer an OBD serial connection over Bluetooth LE. Classic-Bluetooth-only and Wi-Fi adapters can't connect from a browser.",
    };
  }
  if (/timeout/i.test(msg)) {
    return {
      ok: false,
      code: "timeout",
      message: "Connection timed out. Unplug the adapter for 10 seconds, plug it back in, and retry.",
    };
  }
  if (/gatt|disconnect|network/i.test(msg)) {
    return {
      ok: false,
      code: "gatt",
      message:
        "Bluetooth link failed. Close other OBD apps that may hold the adapter, keep the phone close, and retry.",
    };
  }
  return { ok: false, code: "unknown", message: msg || "OBD connection failed." };
}

function toSessionDtc(d: { code: string; ecu: string; kind: ObdSessionDtc["kind"] }): ObdSessionDtc {
  const hit = lookupDtc(d.code);
  return { code: hit.code, desc: hit.desc, severity: hit.severity, kind: d.kind, ecu: d.ecu };
}

/** Same code from several modes → keep one row, preferring stored > permanent > pending. */
function mergeDtcs(list: ObdSessionDtc[]): ObdSessionDtc[] {
  const rank = { stored: 0, permanent: 1, pending: 2 } as const;
  const byCode = new Map<string, ObdSessionDtc>();
  for (const d of list) {
    const prev = byCode.get(d.code);
    if (!prev || rank[d.kind ?? "stored"] < rank[prev.kind ?? "stored"]) {
      byCode.set(d.code, d);
    }
  }
  return [...byCode.values()];
}

type TransportRequest = (options: {
  showAllDevices?: boolean;
  timeoutMs?: number;
}) => Promise<ObdTransport>;

export class OBDConnector {
  private session: ElmSession | null = null;

  constructor(private readonly requestTransport?: TransportRequest) {}

  get isConnected(): boolean {
    return Boolean(this.session?.connected);
  }

  get deviceName(): string {
    return this.session?.transport.deviceName || "OBD adapter";
  }

  /** Pick adapter → connect → ELM init + protocol search. */
  async connectDetailed(options?: {
    timeoutMs?: number;
    showAllDevices?: boolean;
    onStep?: (step: ObdScanStep) => void;
  }): Promise<ObdConnectResult> {
    const support = getObdRuntimeSupport();
    if (!this.requestTransport && !support.supported) {
      return { ok: false, code: support.code || "unsupported", message: support.message };
    }
    this.disconnect();
    try {
      const request = this.requestTransport ?? WebBluetoothTransport.request;
      const transport = await request({
        showAllDevices: options?.showAllDevices,
        timeoutMs: options?.timeoutMs,
      });
      const session = new ElmSession(transport);
      this.session = session;
      await session.initialize(options?.onStep);
      return { ok: true, deviceName: transport.deviceName };
    } catch (err) {
      console.error("[obd] connect failed", err);
      this.disconnect();
      return mapConnectError(err);
    }
  }

  disconnect() {
    const s = this.session;
    this.session = null;
    if (!s) return;
    s.dispose();
    s.transport.disconnect();
  }

  /** Dashboard “Refresh sensors”. */
  async readLiveSensors(): Promise<ObdLiveSensors> {
    if (!this.session?.connected) {
      throw new Error("Not connected — connect the OBD adapter first.");
    }
    return sensorsFromPids(await this.session.readPids(LIVE_PID_NUMBERS));
  }

  /**
   * Connect (if needed) → readiness, stored/pending/permanent codes, freeze
   * frame, live sensors, mileage, VIN. Never throws.
   */
  async readSessionSnapshot(options?: {
    connectIfNeeded?: boolean;
    includeSensors?: boolean;
    onStep?: (step: ObdScanStep) => void;
  }): Promise<ObdSessionSnapshot> {
    const at = new Date().toISOString();
    const failed = (note: string, warning: string): ObdSessionSnapshot => ({
      at,
      deviceName: this.deviceName,
      connected: false,
      codes: [],
      sensors: emptyLiveSensors(),
      odometerKm: null,
      distanceSinceCodesClearedKm: null,
      note,
      warnings: [warning],
    });

    if (!this.session?.connected) {
      if (options?.connectIfNeeded === false) return failed("Not connected.", "not_connected");
      const res = await this.connectDetailed({ onStep: options?.onStep });
      if (!res.ok) return failed(res.message, res.code);
    }
    const session = this.session!;

    try {
      const scan = await session.scan({
        sensorPids: options?.includeSensors === false ? [] : LIVE_PID_NUMBERS,
        onStep: options?.onStep,
      });
      const codes = mergeDtcs(scan.dtcs.map(toSessionDtc));
      const stored = codes.filter((c) => c.kind === "stored").length;
      const warnings = [...scan.warnings];
      if (!scan.pids.has(0xa6) && !scan.pids.has(0x31)) warnings.push("mileage_unavailable");

      const note = codes.length
        ? `Read ${codes.length} code(s) from ${this.deviceName}${stored < codes.length ? ` (${stored} stored)` : ""}.`
        : `Connected to ${this.deviceName} — no stored, pending, or permanent codes reported.`;

      return {
        at: new Date().toISOString(),
        deviceName: this.deviceName,
        connected: true,
        codes,
        sensors: sensorsFromPids(scan.pids),
        odometerKm: scan.pids.get(0xa6) ?? null,
        distanceSinceCodesClearedKm: scan.pids.get(0x31) ?? null,
        note,
        warnings,
        milOn: scan.readiness?.milOn ?? null,
        readiness: scan.readiness,
        smog: scan.readiness
          ? evaluateSmogReadiness(scan.readiness, modelYearFromVin(scan.vin))
          : null,
        freezeFrame: scan.freezeFrame,
        vin: scan.vin,
        adapter: {
          version: session.info.version,
          protocol: session.info.protocol?.label ?? null,
          batteryVoltage: session.info.batteryVoltage,
        },
      };
    } catch (err) {
      console.error("[obd] scan failed", err);
      const mapped = mapConnectError(err);
      if (err instanceof ObdSessionError) this.disconnect();
      return failed(mapped.ok ? "Read failed." : mapped.message, mapped.ok ? "unknown" : mapped.code);
    }
  }
}

/** Shared singleton for the browser session (one adapter at a time). */
let sharedConnector: OBDConnector | null = null;

export function getObdConnector(): OBDConnector {
  if (!sharedConnector) sharedConnector = new OBDConnector();
  return sharedConnector;
}
