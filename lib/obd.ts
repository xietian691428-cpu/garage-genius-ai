/**
 * Web Bluetooth + ELM327-style OBD-II helper for garage DIY scans.
 *
 * Supported in Chrome / Edge / Android Chrome. Safari & iOS WebViews generally
 * do not expose Web Bluetooth — callers should fall back to demo snapshots.
 *
 * BLE UUIDs vary by adapter brand (Veepeak, OBDLINK, generic ELM327 clones).
 * We try a short list of common Nordic UART / custom OBD services.
 *
 * ── Review vs simplified drafts ─────────────────────────
 * ❌ Do NOT return `Record<string, string>` with units baked in
 *    ("90°C") — Dashboard uses typed `ObdLiveSensors` numbers +
 *    `formatLiveSensorValue` / `LIVE_SENSOR_PIDS`.
 * ❌ Do NOT parse with `response.slice(4)` — ELM noise; use `41XX` frame
 *    via exported `parsePIDResponse(pid, raw)`.
 * ✅ PID set matches draft: 05 / 0C / 0D / 11 / 42 / 5C.
 * ✅ Failures leave fields null (never crash the scan).
 * ✅ Use `getObdConnector()` singleton from Dashboard (not `new OBDConnector()`).
 */

export type ObdDtc = {
  code: string;
  desc: string;
  severity: "Info" | "Low" | "Moderate" | "High";
};

export type ObdScanResult = {
  connected: boolean;
  /** Raw adapter responses for debugging */
  raw: string[];
  codes: ObdDtc[];
  note: string;
};

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
 * Dashboard live PID set (Mode 01).
 * Values are numeric — UI adds units (do not return "90°C" strings).
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

/** Format a numeric PID for Dashboard cells */
export function formatLiveSensorValue(
  value: number | null,
  unit: string,
): string {
  if (value == null || Number.isNaN(value)) return "—";
  if (!unit) return String(Math.round(value));
  if (unit === "V") return `${value.toFixed(2)} ${unit}`;
  if (unit === "%") return `${Math.round(value)} ${unit}`;
  return `${Math.round(value)} ${unit}`;
}

type BluetoothRequestDeviceFn = (options: {
  filters?: Array<{ namePrefix?: string; services?: string[] }>;
  acceptAllDevices?: boolean;
  optionalServices?: string[];
}) => Promise<BluetoothDeviceLike>;

type BluetoothDeviceLike = {
  name?: string;
  gatt?: {
    connected: boolean;
    connect: () => Promise<BluetoothRemoteGATTServerLike>;
    disconnect: () => void;
  } | null;
  addEventListener?: (type: string, listener: () => void) => void;
};

type BluetoothRemoteGATTServerLike = {
  connected: boolean;
  getPrimaryService: (service: string) => Promise<BluetoothRemoteGATTServiceLike>;
  device: BluetoothDeviceLike;
};

type BluetoothRemoteGATTServiceLike = {
  getCharacteristic: (
    characteristic: string,
  ) => Promise<BluetoothRemoteGATTCharacteristicLike>;
};

type BluetoothRemoteGATTCharacteristicLike = {
  writeValue: (value: BufferSource) => Promise<void>;
  readValue: () => Promise<DataView>;
  startNotifications?: () => Promise<BluetoothRemoteGATTCharacteristicLike>;
  addEventListener?: (
    type: string,
    listener: (ev: { target: { value?: DataView } }) => void,
  ) => void;
  removeEventListener?: (
    type: string,
    listener: (ev: { target: { value?: DataView } }) => void,
  ) => void;
};

/** Common BLE UART / OBD service + TX characteristic pairs */
const SERVICE_CANDIDATES: Array<{ service: string; write: string; notify?: string }> = [
  {
    // Nordic UART (many ELM327 BLE clones)
    service: "6e400001-b5a3-f393-e0a9-e50e24dcca9e",
    write: "6e400002-b5a3-f393-e0a9-e50e24dcca9e",
    notify: "6e400003-b5a3-f393-e0a9-e50e24dcca9e",
  },
  {
    service: "000018f0-0000-1000-8000-00805f9b34fb",
    write: "00002af1-0000-1000-8000-00805f9b34fb",
    notify: "00002af0-0000-1000-8000-00805f9b34fb",
  },
  {
    service: "0000fff0-0000-1000-8000-00805f9b34fb",
    write: "0000fff2-0000-1000-8000-00805f9b34fb",
    notify: "0000fff1-0000-1000-8000-00805f9b34fb",
  },
  {
    service: "0000ffe0-0000-1000-8000-00805f9b34fb",
    write: "0000ffe1-0000-1000-8000-00805f9b34fb",
  },
];

const DTC_HINTS: Record<string, { desc: string; severity: ObdDtc["severity"] }> =
  {
    P0171: { desc: "System Too Lean (Bank 1)", severity: "Moderate" },
    P0174: { desc: "System Too Lean (Bank 2)", severity: "Moderate" },
    P0300: { desc: "Random/Multiple Cylinder Misfire", severity: "High" },
    P0420: { desc: "Catalyst System Efficiency Below Threshold", severity: "Moderate" },
    P0455: { desc: "EVAP System Large Leak", severity: "Low" },
    C0121: { desc: "ABS Module Communication / Speed Sensor", severity: "Info" },
  };

function getBluetooth(): { requestDevice: BluetoothRequestDeviceFn } | null {
  if (typeof navigator === "undefined") return null;
  const nav = navigator as Navigator & {
    bluetooth?: { requestDevice: BluetoothRequestDeviceFn };
  };
  return nav.bluetooth ?? null;
}

export function isWebBluetoothAvailable(): boolean {
  return Boolean(getBluetooth()?.requestDevice);
}

/** Decode Mode 03 / 07 payload fragments into P0xxx-style codes when possible. */
export function parseDtcResponse(raw: string): ObdDtc[] {
  const cleaned = raw
    .replace(/\s+/g, "")
    .replace(/>/g, "")
    .toUpperCase();

  const found = new Set<string>();

  // Explicit P/C/B/U codes sometimes echoed by apps
  for (const m of cleaned.matchAll(/([PCBU][0-9A-F]{4})/g)) {
    found.add(m[1]);
  }

  // Classic ELM: "43 01 71 ..." → pairs after 43
  const modeIdx = cleaned.indexOf("43");
  if (modeIdx >= 0) {
    const hex = cleaned.slice(modeIdx + 2).replace(/[^0-9A-F]/g, "");
    for (let i = 0; i + 3 < hex.length; i += 4) {
      const a = parseInt(hex.slice(i, i + 2), 16);
      const b = parseInt(hex.slice(i + 2, i + 4), 16);
      if (Number.isNaN(a) || Number.isNaN(b) || (a === 0 && b === 0)) continue;
      const type = ["P", "C", "B", "U"][(a & 0xc0) >> 6] ?? "P";
      const d1 = ((a & 0x30) >> 4).toString(16).toUpperCase();
      const d2 = (a & 0x0f).toString(16).toUpperCase();
      const d3 = ((b & 0xf0) >> 4).toString(16).toUpperCase();
      const d4 = (b & 0x0f).toString(16).toUpperCase();
      found.add(`${type}${d1}${d2}${d3}${d4}`);
    }
  }

  return [...found].map((code) => {
    const hint = DTC_HINTS[code];
    return {
      code,
      desc: hint?.desc ?? "Stored diagnostic trouble code",
      severity: hint?.severity ?? "Moderate",
    };
  });
}

/**
 * Parse Mode 01 ELM response for a single PID.
 * Looks for `41XX` payload (not raw string slice — adapters echo AT noise).
 * Returns null when unsupported / NO DATA / SEARCHING.
 */
export function parsePIDResponse(pid: string, raw: string): number | null {
  const cleanPid = pid.replace(/^0x/i, "").toUpperCase().padStart(2, "0");
  const upper = raw.toUpperCase();
  if (
    /NO DATA|UNABLE TO CONNECT|STOPPED|ERROR|INVALID|BUS INIT|\?/.test(upper) &&
    !upper.includes(`41${cleanPid}`)
  ) {
    return null;
  }
  if (/SEARCHING/.test(upper) && !upper.includes(`41${cleanPid}`)) {
    return null;
  }

  const hex = upper.replace(/[^0-9A-F]/g, "");
  const header = `41${cleanPid}`;
  const idx = hex.indexOf(header);
  if (idx < 0) return null;
  const data = hex.slice(idx + header.length);
  if (data.length < 2) return null;

  const A = parseInt(data.slice(0, 2), 16);
  const B = data.length >= 4 ? parseInt(data.slice(2, 4), 16) : 0;
  if (Number.isNaN(A)) return null;

  switch (cleanPid) {
    case "05": // Coolant °C
    case "0F": // Intake air °C
    case "5C": // Engine oil temp °C (not all ECUs)
      return A - 40;
    case "0C": // RPM = ((A*256)+B)/4
      if (Number.isNaN(B)) return null;
      return Math.round(((A * 256 + B) / 4) * 10) / 10;
    case "0D": // Vehicle speed km/h
      return A;
    case "11": // Throttle %
      return Math.round((A * 100) / 255);
    case "2F": // Fuel level %
      return Math.round((A * 100) / 255);
    case "42": // Control module voltage
      if (Number.isNaN(B)) return null;
      return Math.round(((A * 256 + B) / 1000) * 100) / 100;
    default:
      return A;
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export class OBDConnector {
  private device: BluetoothDeviceLike | null = null;
  private server: BluetoothRemoteGATTServerLike | null = null;
  private characteristic: BluetoothRemoteGATTCharacteristicLike | null = null;
  private notifyChar: BluetoothRemoteGATTCharacteristicLike | null = null;
  private buffer = "";

  get isConnected(): boolean {
    return Boolean(this.server?.connected && this.characteristic);
  }

  get deviceName(): string {
    return this.device?.name || "OBD adapter";
  }

  async connect(): Promise<boolean> {
    const bluetooth = getBluetooth();
    if (!bluetooth) {
      console.warn("[obd] Web Bluetooth unavailable");
      return false;
    }

    try {
      this.device = await bluetooth.requestDevice({
        filters: [
          { namePrefix: "OBD" },
          { namePrefix: "ELM" },
          { namePrefix: "VEEPEAK" },
          { namePrefix: "OBDLINK" },
        ],
        optionalServices: SERVICE_CANDIDATES.map((c) => c.service),
      });
    } catch (firstErr) {
      // Some browsers reject namePrefix filters when no matching devices —
      // fall back to acceptAllDevices for DIY garage adapters with odd names.
      console.warn("[obd] filtered picker failed, trying acceptAllDevices", firstErr);
      try {
        this.device = await bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: SERVICE_CANDIDATES.map((c) => c.service),
        });
      } catch (err) {
        console.error("[obd] connect cancelled/failed", err);
        return false;
      }
    }

    if (!this.device.gatt) return false;

    try {
      this.server = await this.device.gatt.connect();
      this.device.addEventListener?.("gattserverdisconnected", () => {
        this.characteristic = null;
        this.notifyChar = null;
      });

      let opened = false;
      for (const cand of SERVICE_CANDIDATES) {
        try {
          const service = await this.server.getPrimaryService(cand.service);
          this.characteristic = await service.getCharacteristic(cand.write);
          if (cand.notify) {
            try {
              this.notifyChar = await service.getCharacteristic(cand.notify);
              await this.notifyChar.startNotifications?.();
              this.notifyChar.addEventListener?.(
                "characteristicvaluechanged",
                (ev) => {
                  const v = ev.target.value;
                  if (v) {
                    this.buffer += new TextDecoder().decode(v);
                  }
                },
              );
            } catch {
              this.notifyChar = null;
            }
          }
          opened = true;
          break;
        } catch {
          /* try next UUID pair */
        }
      }

      if (!opened || !this.characteristic) {
        throw new Error("No compatible OBD BLE service/characteristic found");
      }

      await this.sendCommand("ATZ");
      await sleep(300);
      await this.sendCommand("ATE0");
      await this.sendCommand("ATL0");
      await this.sendCommand("ATS0");
      await this.sendCommand("ATH0");
      return true;
    } catch (err) {
      console.error("[obd] GATT setup failed", err);
      this.disconnect();
      return false;
    }
  }

  disconnect() {
    try {
      this.device?.gatt?.disconnect();
    } catch {
      /* ignore */
    }
    this.device = null;
    this.server = null;
    this.characteristic = null;
    this.notifyChar = null;
    this.buffer = "";
  }

  private async sendCommand(cmd: string, waitMs = 450): Promise<string> {
    if (!this.characteristic) throw new Error("Not connected");
    this.buffer = "";
    const payload = new TextEncoder().encode(`${cmd}\r`);
    await this.characteristic.writeValue(payload);

    // Poll until ELM prompt `>` or timeout (more reliable than fixed sleep alone)
    const deadline = Date.now() + waitMs + 600;
    while (Date.now() < deadline) {
      if (this.buffer.includes(">")) break;
      await sleep(40);
    }

    if (this.buffer.trim()) {
      return this.buffer;
    }

    // Fallback read for adapters that expose readable TX on same char
    try {
      const value = await this.characteristic.readValue();
      return new TextDecoder().decode(value);
    } catch {
      return this.buffer || "";
    }
  }

  async readDTCs(): Promise<ObdDtc[]> {
    const stored = await this.sendCommand("03", 600);
    const pending = await this.sendCommand("07", 600);
    const codes = [
      ...parseDtcResponse(stored),
      ...parseDtcResponse(pending),
    ];
    // de-dupe by code
    const seen = new Set<string>();
    return codes.filter((c) => {
      if (seen.has(c.code)) return false;
      seen.add(c.code);
      return true;
    });
  }

  /**
   * Mode 01 current-data PID (e.g. "05" coolant, "0C" RPM, "42" voltage).
   * Returns null when the ECU/adapter does not support the PID.
   */
  async readPID(pid: string): Promise<number | null> {
    const clean = pid.replace(/^0x/i, "").replace(/\s+/g, "").toUpperCase();
    if (!/^[0-9A-F]{2}$/.test(clean)) {
      throw new Error(`Invalid PID: ${pid}`);
    }
    const raw = await this.sendCommand(`01${clean}`, 500);
    return parsePIDResponse(clean, raw);
  }

  /**
   * Batch Mode 01 live sensors for Dashboard.
   * Same PID set as the sketch (05/0C/0D/11/42/5C) but typed numeric fields.
   */
  async readLiveSensors(): Promise<ObdLiveSensors> {
    if (!this.isConnected) {
      throw new Error("Not connected — call connect() before readLiveSensors()");
    }

    const sensors = emptyLiveSensors();

    for (const { key, pid } of LIVE_SENSOR_PIDS) {
      try {
        const value = await this.readPID(pid);
        if (value != null) sensors[key] = value;
      } catch {
        /* PID unsupported — leave null */
      }
      // Brief gap so cheap ELM clones don't drop frames
      await sleep(60);
    }

    sensors.at = new Date().toISOString();
    return sensors;
  }

  /**
   * Full DIY scan: connect (if needed) → AT init → Mode 03/07.
   * Does not throw — returns connected:false for UI fallbacks.
   */
  async scan(): Promise<ObdScanResult> {
    const raw: string[] = [];
    if (!this.isConnected) {
      const ok = await this.connect();
      if (!ok) {
        return {
          connected: false,
          raw,
          codes: [],
          note: "OBD connection failed or cancelled.",
        };
      }
    }

    try {
      const codes = await this.readDTCs();
      return {
        connected: true,
        raw,
        codes,
        note: codes.length
          ? `Read ${codes.length} code(s) from ${this.deviceName}.`
          : `Connected to ${this.deviceName} — no stored/pending DTCs reported.`,
      };
    } catch (err) {
      console.error("[obd] scan failed", err);
      return {
        connected: true,
        raw,
        codes: [],
        note:
          err instanceof Error
            ? err.message
            : "Connected but DTC read failed.",
      };
    }
  }
}

/** Shared singleton for the browser session (one adapter at a time). */
let sharedConnector: OBDConnector | null = null;

export function getObdConnector(): OBDConnector {
  if (!sharedConnector) sharedConnector = new OBDConnector();
  return sharedConnector;
}
