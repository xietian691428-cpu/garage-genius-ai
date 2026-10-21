/**
 * Pure SAE J1979 / ELM327 response parsing — no Bluetooth, no DOM.
 *
 * Every transport (Web Bluetooth today, native BLE / Classic / Wi-Fi later)
 * feeds raw adapter text through these helpers, so the decoding rules live in
 * one tested place.
 *
 * The session runs with headers ON (ATH1) so responses from several ECUs and
 * multi-frame ISO-TP messages can be separated. Header-less output is still
 * accepted for clones that ignore ATH1.
 */

import { normalizeVin } from "@/lib/vehicle-data/vin";

// ── Protocols ───────────────────────────────────────────

export type ElmProtocolInfo = {
  /** ELM327 protocol number (ATDPN), "1"…"C" */
  id: string;
  label: string;
  can: boolean;
  /** 29-bit CAN identifiers */
  extendedCan: boolean;
};

const PROTOCOLS: Record<string, Omit<ElmProtocolInfo, "id">> = {
  "1": { label: "SAE J1850 PWM", can: false, extendedCan: false },
  "2": { label: "SAE J1850 VPW", can: false, extendedCan: false },
  "3": { label: "ISO 9141-2", can: false, extendedCan: false },
  "4": { label: "ISO 14230-4 KWP (5 baud init)", can: false, extendedCan: false },
  "5": { label: "ISO 14230-4 KWP (fast init)", can: false, extendedCan: false },
  "6": { label: "ISO 15765-4 CAN (11 bit, 500 kbaud)", can: true, extendedCan: false },
  "7": { label: "ISO 15765-4 CAN (29 bit, 500 kbaud)", can: true, extendedCan: true },
  "8": { label: "ISO 15765-4 CAN (11 bit, 250 kbaud)", can: true, extendedCan: false },
  "9": { label: "ISO 15765-4 CAN (29 bit, 250 kbaud)", can: true, extendedCan: true },
  A: { label: "SAE J1939 CAN", can: true, extendedCan: true },
  B: { label: "User CAN (11 bit)", can: true, extendedCan: false },
  C: { label: "User CAN (29 bit)", can: true, extendedCan: true },
};

export function protocolInfo(id: string): ElmProtocolInfo | null {
  const key = id.toUpperCase();
  const p = PROTOCOLS[key];
  return p ? { id: key, ...p } : null;
}

/** Parse `ATDPN` output ("A6", "6", "A7") into protocol info. */
export function parseProtocolNumber(raw: string): ElmProtocolInfo | null {
  for (const line of cleanElmLines(raw, "ATDPN")) {
    const m = /^A?([1-9A-C])$/i.exec(line.replace(/\s+/g, ""));
    if (m) return protocolInfo(m[1]);
  }
  return null;
}

// ── Raw text cleanup / errors ───────────────────────────

/**
 * Split adapter output into meaningful lines: drops the `>` prompt, NULs,
 * command echo, and "SEARCHING…" / "BUS INIT: …" progress text.
 */
export function cleanElmLines(raw: string, command?: string): string[] {
  const echo = command?.replace(/\s+/g, "").toUpperCase();
  return raw
    .replace(/\0/g, "")
    .split(/[\r\n]+/)
    .map((l) =>
      l
        .replace(/>/g, "")
        .replace(/^\s*SEARCHING\.*\s*/i, "")
        .replace(/^\s*BUS INIT:?\s*\.*\s*/i, "")
        .trim(),
    )
    .filter((l) => l.length > 0)
    .filter((l) => !echo || l.replace(/\s+/g, "").toUpperCase() !== echo);
}

export type ElmErrorCode =
  | "unable_to_connect"
  | "no_data"
  | "can_error"
  | "bus_error"
  | "buffer_full"
  | "stopped"
  | "adapter_reset"
  | "unknown_command";

const ELM_ERROR_PATTERNS: Array<[RegExp, ElmErrorCode]> = [
  [/UNABLE TO CONNECT/i, "unable_to_connect"],
  [/NO DATA/i, "no_data"],
  [/CAN ERROR/i, "can_error"],
  [/BUS ERROR|BUS BUSY|FB ERROR|DATA ERROR|^ERR\d+/i, "bus_error"],
  [/BUFFER FULL/i, "buffer_full"],
  [/STOPPED/i, "stopped"],
  [/LV RESET|ACT ALERT|LP ALERT/i, "adapter_reset"],
  [/^\?$/, "unknown_command"],
];

/** First ELM error keyword in the response, if any. */
export function detectElmError(raw: string): ElmErrorCode | null {
  for (const line of cleanElmLines(raw)) {
    for (const [re, code] of ELM_ERROR_PATTERNS) {
      if (re.test(line)) return code;
    }
  }
  return null;
}

/**
 * Mode 04 (clear/reset emission-related diagnostic information) positive
 * response is service `0x44`. ELM clones may also echo bare `OK`.
 * `NO DATA` alone is ambiguous — callers should re-read Mode 03 to verify.
 */
export function isClearDtcAcknowledged(
  raw: string,
  messages: ObdMessage[],
): boolean {
  if (messages.some((m) => m.data[0] === 0x44)) return true;
  for (const line of cleanElmLines(raw, "04")) {
    if (/^OK$/i.test(line)) return true;
    // Header-less single-byte positive response
    if (/^44$/i.test(line.replace(/\s+/g, ""))) return true;
  }
  return false;
}

/** Hard failures that mean Mode 04 did not reach the ECU. */
export function isClearDtcHardFailure(raw: string): boolean {
  const err = detectElmError(raw);
  return (
    err === "unable_to_connect" ||
    err === "can_error" ||
    err === "bus_error" ||
    err === "stopped" ||
    err === "adapter_reset" ||
    err === "unknown_command" ||
    err === "buffer_full"
  );
}

// ── Frame parsing ───────────────────────────────────────

/** One logical OBD response from one ECU (ISO-TP already reassembled). */
export type ObdMessage = {
  /** CAN id ("7E8", "18DAF110"), legacy source byte ("10"), or "#n" when headers are off */
  ecu: string;
  /** Service byte first, e.g. [0x43, …] for Mode 03 */
  data: number[];
};

function hexToBytes(hex: string): number[] | null {
  const compact = hex.replace(/\s+/g, "");
  if (!compact || compact.length % 2 !== 0 || !/^[0-9A-F]+$/i.test(compact)) {
    return null;
  }
  const out: number[] = [];
  for (let i = 0; i < compact.length; i += 2) {
    out.push(parseInt(compact.slice(i, i + 2), 16));
  }
  return out;
}

type HeaderSplit = { ecu: string; data: number[]; can: boolean };

function splitHeader(
  line: string,
  protocol: ElmProtocolInfo | null,
): HeaderSplit | null {
  const trimmed = line.trim().toUpperCase();
  const tokens = trimmed.split(/\s+/);

  if (tokens.length > 1) {
    if (tokens[0].length === 3) {
      const data = hexToBytes(tokens.slice(1).join(""));
      return data ? { ecu: tokens[0], data, can: true } : null;
    }
    const looksExtended =
      protocol?.extendedCan || (!protocol && tokens[0] === "18" && tokens[1] === "DA");
    if (looksExtended && tokens.length >= 5) {
      const data = hexToBytes(tokens.slice(4).join(""));
      return data
        ? { ecu: tokens.slice(0, 4).join(""), data, can: true }
        : null;
    }
    if (protocol && !protocol.can && tokens.length >= 4) {
      const data = hexToBytes(tokens.slice(3).join(""));
      return data ? { ecu: tokens[2], data, can: false } : null;
    }
    return null;
  }

  const compact = trimmed;
  if (!/^[0-9A-F]+$/.test(compact)) return null;
  if (protocol?.can && protocol.extendedCan) {
    const data = hexToBytes(compact.slice(8));
    return data ? { ecu: compact.slice(0, 8), data, can: true } : null;
  }
  if (protocol && !protocol.can) {
    const data = hexToBytes(compact.slice(6));
    return data ? { ecu: compact.slice(4, 6), data, can: false } : null;
  }
  // 11-bit CAN (known or guessed): 3-char header makes the length odd
  if (compact.length % 2 === 1) {
    const data = hexToBytes(compact.slice(3));
    return data ? { ecu: compact.slice(0, 3), data, can: true } : null;
  }
  return null;
}

/** Engine ECU first (7E8 / …10), then by id. */
function ecuRank(ecu: string): number {
  const id = ecu.toUpperCase();
  if (id === "7E8" || id.endsWith("F110") || id === "10") return 0;
  if (id.startsWith("#")) return 1;
  return 2;
}

/**
 * Turn raw adapter text into per-ECU messages.
 *
 * - `headers: true` (ATH1): CAN frames are ISO-TP reassembled per ECU; legacy
 *   frames lose their 3 header bytes and trailing checksum.
 * - `headers: false`: each line is one message; "014 / 0: … / 1: …" multi-frame
 *   blocks are joined.
 */
export function parseObdMessages(
  raw: string,
  options: {
    protocol?: ElmProtocolInfo | null;
    headers?: boolean;
    command?: string;
  } = {},
): ObdMessage[] {
  const protocol = options.protocol ?? null;
  const headers = options.headers !== false;
  const lines = cleanElmLines(raw, options.command);

  const out: ObdMessage[] = [];
  const isoTp = new Map<string, { len: number; bytes: number[] }>();
  let anon = 0;
  let block: { len: number; bytes: number[] } | null = null;

  const flushBlock = () => {
    if (block && block.bytes.length) {
      out.push({
        ecu: `#${anon++}`,
        data: Number.isFinite(block.len)
          ? block.bytes.slice(0, block.len)
          : block.bytes,
      });
    }
    block = null;
  };

  for (const line of lines) {
    const compact = line.replace(/\s+/g, "").toUpperCase();

    // Header-less CAN multi-frame: byte-count line, then "0: …", "1: …"
    if (/^[0-9A-F]{3}$/.test(compact)) {
      flushBlock();
      block = { len: parseInt(compact, 16), bytes: [] };
      continue;
    }
    const indexed = /^([0-9A-F]):\s*([0-9A-F\s]+)$/i.exec(line.trim());
    if (indexed) {
      const bytes = hexToBytes(indexed[2]);
      if (!bytes) continue;
      if (!block) block = { len: Number.POSITIVE_INFINITY, bytes: [] };
      block.bytes.push(...bytes);
      continue;
    }
    if (!/^[0-9A-F\s]+$/i.test(line)) continue;
    flushBlock();

    const split = headers ? splitHeader(line, protocol) : null;
    if (!split) {
      const data = hexToBytes(compact);
      if (data?.length) out.push({ ecu: `#${anon++}`, data });
      continue;
    }

    if (!split.can) {
      // Legacy: strip trailing checksum byte
      if (split.data.length >= 2) {
        out.push({ ecu: split.ecu, data: split.data.slice(0, -1) });
      }
      continue;
    }

    const { ecu, data } = split;
    if (!data.length) continue;
    const pci = data[0];
    const frameType = pci >> 4;
    if (frameType === 0) {
      const len = pci & 0x0f;
      if (len > 0) out.push({ ecu, data: data.slice(1, 1 + len) });
    } else if (frameType === 1 && data.length >= 2) {
      const len = ((pci & 0x0f) << 8) | data[1];
      isoTp.set(ecu, { len, bytes: data.slice(2) });
    } else if (frameType === 2) {
      const st = isoTp.get(ecu);
      if (!st) continue;
      st.bytes.push(...data.slice(1));
      if (st.bytes.length >= st.len) {
        out.push({ ecu, data: st.bytes.slice(0, st.len) });
        isoTp.delete(ecu);
      }
    }
    // frameType 3 (flow control) is ignored
  }
  flushBlock();
  // Incomplete multi-frame: keep what arrived; decoders validate content.
  for (const [ecu, st] of isoTp) {
    if (st.bytes.length) out.push({ ecu, data: st.bytes });
  }

  return out
    .map((m, i) => ({ m, i }))
    .sort((a, b) => ecuRank(a.m.ecu) - ecuRank(b.m.ecu) || a.i - b.i)
    .map(({ m }) => m);
}

// ── DTCs (Modes 03 / 07 / 0A) ───────────────────────────

export type DtcKind = "stored" | "pending" | "permanent";

const DTC_SERVICE: Record<DtcKind, number> = {
  stored: 0x43,
  pending: 0x47,
  permanent: 0x4a,
};

export const DTC_REQUEST: Record<DtcKind, string> = {
  stored: "03",
  pending: "07",
  permanent: "0A",
};

/** Two raw bytes → "P0171". Returns null for the 0000 padding pair. */
export function decodeDtcPair(a: number, b: number): string | null {
  if (a === 0 && b === 0) return null;
  const letter = "PCBU"[(a >> 6) & 0x03];
  const hex = (n: number) => n.toString(16).toUpperCase();
  return `${letter}${hex((a >> 4) & 0x03)}${hex(a & 0x0f)}${hex(b >> 4)}${hex(b & 0x0f)}`;
}

export type DecodedDtc = { code: string; ecu: string; kind: DtcKind };

/**
 * CAN responses carry a DTC-count byte after the service id
 * (`43 02 01 71 03 00`); legacy protocols don't (`43 01 71 00 00 00 00`).
 * When the protocol is unknown, the body length decides: CAN bodies are odd.
 */
export function decodeDtcMessages(
  messages: ObdMessage[],
  kind: DtcKind,
  protocol?: ElmProtocolInfo | null,
): DecodedDtc[] {
  const svc = DTC_SERVICE[kind];
  const seen = new Set<string>();
  const out: DecodedDtc[] = [];
  for (const m of messages) {
    if (m.data[0] !== svc) continue;
    let body = m.data.slice(1);
    const hasCount = protocol ? protocol.can : body.length % 2 === 1;
    if (hasCount) {
      const count = body[0] ?? 0;
      body = body.slice(1, 1 + count * 2);
    }
    for (let i = 0; i + 1 < body.length; i += 2) {
      const code = decodeDtcPair(body[i], body[i + 1]);
      if (!code || seen.has(code)) continue;
      seen.add(code);
      out.push({ code, ecu: m.ecu, kind });
    }
  }
  return out;
}

// ── Mode 01 / 02 PIDs ───────────────────────────────────

export type PidUnit = "°C" | "km/h" | "%" | "rpm" | "V" | "kPa" | "g/s" | "km" | "s" | "°";

export const PID_INFO: Record<number, { label: string; unit: PidUnit }> = {
  0x04: { label: "Engine load", unit: "%" },
  0x05: { label: "Coolant", unit: "°C" },
  0x06: { label: "Short fuel trim B1", unit: "%" },
  0x07: { label: "Long fuel trim B1", unit: "%" },
  0x08: { label: "Short fuel trim B2", unit: "%" },
  0x09: { label: "Long fuel trim B2", unit: "%" },
  0x0b: { label: "Intake manifold pressure", unit: "kPa" },
  0x0c: { label: "RPM", unit: "rpm" },
  0x0d: { label: "Speed", unit: "km/h" },
  0x0e: { label: "Timing advance", unit: "°" },
  0x0f: { label: "Intake air temp", unit: "°C" },
  0x10: { label: "MAF air flow", unit: "g/s" },
  0x11: { label: "Throttle", unit: "%" },
  0x1f: { label: "Run time since start", unit: "s" },
  0x21: { label: "Distance with MIL on", unit: "km" },
  0x2f: { label: "Fuel level", unit: "%" },
  0x31: { label: "Distance since codes cleared", unit: "km" },
  0x33: { label: "Barometric pressure", unit: "kPa" },
  0x42: { label: "Control module voltage", unit: "V" },
  0x46: { label: "Ambient air temp", unit: "°C" },
  0x5c: { label: "Oil temp", unit: "°C" },
  0xa6: { label: "Odometer", unit: "km" },
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/** SAE J1979 scaling. `bytes` are the data bytes after the PID byte. */
export function decodePidValue(pid: number, bytes: number[]): number | null {
  const [A, B] = bytes;
  if (A === undefined) return null;
  const AB = () => (B === undefined ? null : A * 256 + B);
  switch (pid) {
    case 0x04:
    case 0x11:
    case 0x2f:
      return Math.round((A * 100) / 255);
    case 0x05:
    case 0x0f:
    case 0x46:
    case 0x5c:
      return A - 40;
    case 0x06:
    case 0x07:
    case 0x08:
    case 0x09:
      return round1(((A - 128) * 100) / 128);
    case 0x0b:
    case 0x0d:
    case 0x33:
      return A;
    case 0x0c: {
      const v = AB();
      return v == null ? null : round1(v / 4);
    }
    case 0x0e:
      return round1(A / 2 - 64);
    case 0x10: {
      const v = AB();
      return v == null ? null : round1(v / 100);
    }
    case 0x1f:
    case 0x21:
    case 0x31:
      return AB();
    case 0x42: {
      const v = AB();
      return v == null ? null : Math.round(v) / 1000;
    }
    case 0xa6: {
      if (bytes.length < 4) return null;
      const raw = ((A << 24) >>> 0) + (B << 16) + (bytes[2] << 8) + bytes[3];
      return raw > 0 ? round1(raw / 10) : null;
    }
    default:
      return A;
  }
}

/** Data bytes for a Mode 01 (or Mode 02 freeze-frame) PID reply, engine ECU first. */
export function findPidBytes(
  messages: ObdMessage[],
  pid: number,
  mode: 0x01 | 0x02 = 0x01,
): number[] | null {
  for (const m of messages) {
    if (m.data[0] !== 0x40 + mode || m.data[1] !== pid) continue;
    return m.data.slice(mode === 0x02 ? 3 : 2);
  }
  return null;
}

/** Union of supported PIDs from a 0100 / 0120 / 0140 … bitmap reply. */
export function decodeSupportedPids(messages: ObdMessage[], base: number): Set<number> {
  const out = new Set<number>();
  for (const m of messages) {
    if (m.data[0] !== 0x41 || m.data[1] !== base) continue;
    const mask = m.data.slice(2, 6);
    mask.forEach((byte, i) => {
      for (let bit = 0; bit < 8; bit++) {
        if (byte & (0x80 >> bit)) out.add(base + i * 8 + bit + 1);
      }
    });
  }
  return out;
}

// ── Readiness monitors (Mode 01 PID 01) ─────────────────

export type ReadinessMonitorId =
  | "misfire"
  | "fuel_system"
  | "components"
  | "catalyst"
  | "heated_catalyst"
  | "evap"
  | "secondary_air"
  | "ac_refrigerant"
  | "o2_sensor"
  | "o2_heater"
  | "egr"
  | "nmhc_catalyst"
  | "nox_scr"
  | "boost_pressure"
  | "exhaust_gas_sensor"
  | "pm_filter"
  | "egr_vvt";

export type ReadinessMonitor = {
  id: ReadinessMonitorId;
  label: string;
  continuous: boolean;
  ready: boolean;
};

export type ObdReadiness = {
  milOn: boolean;
  /** Confirmed DTC count reported by the ECU */
  dtcCount: number;
  ignition: "spark" | "compression";
  /** Only monitors this vehicle supports */
  monitors: ReadinessMonitor[];
};

const MONITOR_LABELS: Record<ReadinessMonitorId, string> = {
  misfire: "Misfire",
  fuel_system: "Fuel system",
  components: "Comprehensive components",
  catalyst: "Catalyst",
  heated_catalyst: "Heated catalyst",
  evap: "EVAP system",
  secondary_air: "Secondary air",
  ac_refrigerant: "A/C refrigerant",
  o2_sensor: "Oxygen sensor",
  o2_heater: "Oxygen sensor heater",
  egr: "EGR system",
  nmhc_catalyst: "NMHC catalyst",
  nox_scr: "NOx / SCR aftertreatment",
  boost_pressure: "Boost pressure",
  exhaust_gas_sensor: "Exhaust gas sensor",
  pm_filter: "Particulate filter",
  egr_vvt: "EGR / VVT system",
};

const SPARK_MONITORS: Array<ReadinessMonitorId | null> = [
  "catalyst",
  "heated_catalyst",
  "evap",
  "secondary_air",
  "ac_refrigerant",
  "o2_sensor",
  "o2_heater",
  "egr",
];

const COMPRESSION_MONITORS: Array<ReadinessMonitorId | null> = [
  "nmhc_catalyst",
  "nox_scr",
  null,
  "boost_pressure",
  null,
  "exhaust_gas_sensor",
  "pm_filter",
  "egr_vvt",
];

/** PID 01 bytes A–D → MIL, DTC count, and supported monitor readiness. */
export function decodeMonitorStatus(bytes: number[]): ObdReadiness | null {
  if (bytes.length < 4) return null;
  const [A, B, C, D] = bytes;
  const ignition = B & 0x08 ? "compression" : "spark";
  const monitors: ReadinessMonitor[] = [];

  const continuous: ReadinessMonitorId[] = ["misfire", "fuel_system", "components"];
  continuous.forEach((id, bit) => {
    if (!(B & (1 << bit))) return;
    monitors.push({
      id,
      label: MONITOR_LABELS[id],
      continuous: true,
      ready: !(B & (1 << (bit + 4))),
    });
  });

  const table = ignition === "spark" ? SPARK_MONITORS : COMPRESSION_MONITORS;
  table.forEach((id, bit) => {
    if (!id || !(C & (1 << bit))) return;
    monitors.push({
      id,
      label: MONITOR_LABELS[id],
      continuous: false,
      ready: !(D & (1 << bit)),
    });
  });

  return {
    milOn: Boolean(A & 0x80),
    dtcCount: A & 0x7f,
    ignition,
    monitors,
  };
}

export type SmogReadiness = {
  verdict: "ready" | "not_ready" | "mil_on" | "unknown";
  /** Incomplete monitors most US programs tolerate for this model year */
  allowedIncomplete: number;
  incomplete: ReadinessMonitor[];
};

/**
 * Typical US I/M (smog) OBD rule per EPA guidance: MIL commanded on fails;
 * 1996–2000 cars may have up to 2 incomplete monitors, 2001+ up to 1.
 * States differ — UI must label this as an estimate.
 */
export function evaluateSmogReadiness(
  readiness: ObdReadiness | null,
  modelYear?: number | null,
): SmogReadiness {
  const allowedIncomplete =
    modelYear != null && modelYear >= 1996 && modelYear <= 2000 ? 2 : 1;
  if (!readiness || (modelYear != null && modelYear < 1996)) {
    return { verdict: "unknown", allowedIncomplete, incomplete: [] };
  }
  const incomplete = readiness.monitors.filter((m) => !m.ready);
  if (readiness.milOn) {
    return { verdict: "mil_on", allowedIncomplete, incomplete };
  }
  return {
    verdict: incomplete.length <= allowedIncomplete ? "ready" : "not_ready",
    allowedIncomplete,
    incomplete,
  };
}

// ── VIN (Mode 09 PID 02) ────────────────────────────────

function vinFromBytes(bytes: number[]): string | null {
  const text = bytes
    .filter((b) => (b >= 0x30 && b <= 0x39) || (b >= 0x41 && b <= 0x5a))
    .map((b) => String.fromCharCode(b))
    .join("");
  if (text.length < 17) return null;
  return normalizeVin(text.slice(-17));
}

/**
 * CAN: one reassembled message `49 02 01` + 17 ASCII bytes.
 * Legacy: five frames `49 02 <seq>` + 4 bytes each (first padded with 00s).
 */
export function decodeVin(messages: ObdMessage[]): string | null {
  const vinMsgs = messages.filter((m) => m.data[0] === 0x49 && m.data[1] === 0x02);
  for (const m of vinMsgs) {
    const vin = vinFromBytes(m.data.slice(3));
    if (vin) return vin;
  }
  const bySeq = new Map<number, number[]>();
  for (const m of vinMsgs) {
    if (!bySeq.has(m.data[2])) bySeq.set(m.data[2], m.data.slice(3));
  }
  const joined = [...bySeq.entries()]
    .sort((a, b) => a[0] - b[0])
    .flatMap(([, bytes]) => bytes);
  return vinFromBytes(joined);
}

const VIN_YEAR_CODES = "ABCDEFGHJKLMNPRSTVWXY123456789";

/**
 * Model year from VIN position 10. North American VINs use position 7
 * (letter → 2010+ cycle) to resolve the 30-year ambiguity.
 */
export function modelYearFromVin(vin?: string | null): number | null {
  const v = normalizeVin(vin);
  if (!v) return null;
  const idx = VIN_YEAR_CODES.indexOf(v[9]);
  if (idx < 0) return null;
  const base = 1980 + idx;
  return /[A-Z]/.test(v[6]) ? base + 30 : base;
}

// ── Freeze frame (Mode 02) ──────────────────────────────

/** Mode 02 PID 02 → the DTC that stored freeze frame 0. */
export function decodeFreezeFrameDtc(messages: ObdMessage[]): string | null {
  const bytes = findPidBytes(messages, 0x02, 0x02);
  if (!bytes || bytes.length < 2) return null;
  return decodeDtcPair(bytes[0], bytes[1]);
}

// ── Adapter info ────────────────────────────────────────

/** `ATRV` → battery voltage at the OBD port ("12.4V"). */
export function parseAdapterVoltage(raw: string): number | null {
  for (const line of cleanElmLines(raw, "ATRV")) {
    const m = /(\d{1,2}(?:\.\d{1,2})?)\s*V/i.exec(line);
    if (m) {
      const v = Number(m[1]);
      if (v > 3 && v < 30) return v;
    }
  }
  return null;
}

/** `ATI` / `ATZ` banner → "ELM327 v1.5" */
export function parseAdapterVersion(raw: string): string | null {
  for (const line of cleanElmLines(raw)) {
    const m = /(ELM327|STN\d+|OBDLink|vLinker|OBDII)[^\r\n]*/i.exec(line);
    if (m) return m[0].trim().slice(0, 40);
  }
  return null;
}
