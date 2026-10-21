/**
 * ELM327 command session over any `ObdTransport`.
 *
 * - One command in flight at a time; replies end at the `>` prompt.
 * - First OBD request gets a long timeout because the adapter auto-searches
 *   protocols ("SEARCHING...") on the first request.
 * - Every read is best-effort: unsupported PIDs / modes leave fields empty.
 */

import {
  DTC_REQUEST,
  type DecodedDtc,
  type DtcKind,
  type ElmProtocolInfo,
  type ObdMessage,
  type ObdReadiness,
  type PidUnit,
  PID_INFO,
  cleanElmLines,
  decodeDtcMessages,
  decodeFreezeFrameDtc,
  decodeMonitorStatus,
  decodePidValue,
  decodeSupportedPids,
  decodeVin,
  detectElmError,
  findPidBytes,
  isClearDtcAcknowledged,
  isClearDtcHardFailure,
  parseAdapterVersion,
  parseAdapterVoltage,
  parseObdMessages,
  parseProtocolNumber,
} from "@/lib/obd-protocol";
import type { ObdTransport } from "@/lib/obd-transport";

export type ObdFailureCode = "adapter_silent" | "no_ecu" | "disconnected";

export class ObdSessionError extends Error {
  constructor(
    readonly code: ObdFailureCode,
    message: string,
  ) {
    super(message);
    this.name = "ObdSessionError";
  }
}

export type ObdScanStep =
  | "init"
  | "search"
  | "readiness"
  | "codes"
  | "freeze_frame"
  | "sensors"
  | "vin";

export type ElmAdapterInfo = {
  version: string | null;
  protocol: ElmProtocolInfo | null;
  batteryVoltage: number | null;
};

export type FreezeFrameValue = {
  pid: number;
  label: string;
  value: number;
  unit: PidUnit;
};

export type ElmScanResult = {
  readiness: ObdReadiness | null;
  dtcs: DecodedDtc[];
  freezeFrame: { dtc: string | null; values: FreezeFrameValue[] } | null;
  pids: Map<number, number>;
  vin: string | null;
  warnings: string[];
};

const DEFAULT_TIMEOUT_MS = 3_000;
const SEARCH_TIMEOUT_MS = 15_000;
const FREEZE_FRAME_PIDS = [0x04, 0x05, 0x06, 0x07, 0x0c, 0x0d, 0x11];

const hex2 = (n: number) => n.toString(16).toUpperCase().padStart(2, "0");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class ElmSession {
  private rx = "";
  private waiter: (() => void) | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private headers = true;
  private supported = new Set<number>();
  private unsubscribe: Array<() => void> = [];
  private lost = false;
  info: ElmAdapterInfo = { version: null, protocol: null, batteryVoltage: null };

  constructor(readonly transport: ObdTransport) {
    this.unsubscribe.push(
      transport.onData((chunk) => {
        this.rx += chunk;
        if (this.rx.includes(">")) this.waiter?.();
      }),
      transport.onDisconnect(() => {
        this.lost = true;
        this.waiter?.();
      }),
    );
  }

  get connected(): boolean {
    return !this.lost && this.transport.connected;
  }

  get supportedPids(): ReadonlySet<number> {
    return this.supported;
  }

  dispose(): void {
    for (const u of this.unsubscribe) u();
    this.unsubscribe = [];
  }

  /** Send one command and resolve with everything up to the `>` prompt. */
  send(command: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<string> {
    const run = () => this.sendNow(command, timeoutMs);
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async sendNow(command: string, timeoutMs: number): Promise<string> {
    if (this.lost) {
      throw new ObdSessionError("disconnected", "Adapter disconnected");
    }
    this.rx = "";
    const reply = new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        this.waiter = null;
        resolve(false);
      }, timeoutMs);
      this.waiter = () => {
        clearTimeout(timer);
        this.waiter = null;
        resolve(true);
      };
    });
    await this.transport.write(`${command}\r`);
    const gotPrompt = await reply;
    if (this.lost) {
      throw new ObdSessionError("disconnected", "Adapter disconnected");
    }
    const text = this.rx;
    if (!gotPrompt) {
      // Let a late prompt land so it doesn't leak into the next reply.
      await sleep(250);
    }
    this.rx = "";
    return text;
  }

  private parse(raw: string, command: string): ObdMessage[] {
    return parseObdMessages(raw, {
      protocol: this.info.protocol,
      headers: this.headers,
      command,
    });
  }

  /**
   * Reset adapter, find the vehicle protocol, and load supported PIDs.
   * @param options.protocol ELM ATSP id (`0` auto, `1`–`9`, `A`–`C`). Default auto.
   * @param options.skipSupportedPidWalk Self-check only needs 0100, not the full bitmap walk.
   */
  async initialize(
    onStep?: (step: ObdScanStep) => void,
    options?: { protocol?: string; skipSupportedPidWalk?: boolean },
  ): Promise<ElmAdapterInfo> {
    onStep?.("init");
    let banner = await this.send("ATZ", 4_000);
    if (!cleanElmLines(banner, "ATZ").length) banner = await this.send("ATI", 3_000);
    if (!cleanElmLines(banner, "ATI").length) {
      throw new ObdSessionError(
        "adapter_silent",
        "The adapter connected but did not answer ELM327 commands.",
      );
    }
    await sleep(200);
    await this.send("ATE0");
    await this.send("ATL0");
    await this.send("ATS1");
    this.headers = /OK/i.test(await this.send("ATH1"));
    await this.send("ATAT1");
    const sp = (options?.protocol ?? "0").toUpperCase().replace(/^ATSP/i, "");
    const spCmd = /^[0-9A-C]$/.test(sp) ? sp : "0";
    await this.send(`ATSP${spCmd}`);

    this.info.version =
      parseAdapterVersion(banner) ?? parseAdapterVersion(await this.send("ATI"));
    this.info.batteryVoltage = parseAdapterVoltage(await this.send("ATRV"));

    onStep?.("search");
    // Protocol must be known before parsing: legacy headers differ from CAN.
    let raw = await this.send("0100", SEARCH_TIMEOUT_MS);
    this.info.protocol = parseProtocolNumber(await this.send("ATDPN"));
    if (!this.hasReply(raw, "0100", 0x41, 0x00)) {
      raw = await this.send("0100", SEARCH_TIMEOUT_MS);
      this.info.protocol = parseProtocolNumber(await this.send("ATDPN"));
    }

    if (!this.hasReply(raw, "0100", 0x41, 0x00)) {
      const err = detectElmError(raw);
      throw new ObdSessionError(
        "no_ecu",
        err === "unable_to_connect" || err === "no_data" || !err
          ? "The adapter is working but the car did not answer."
          : `The car's data bus reported ${err.replace(/_/g, " ")}.`,
      );
    }

    this.supported = decodeSupportedPids(this.parse(raw, "0100"), 0x00);
    if (!options?.skipSupportedPidWalk) {
      for (let base = 0x20; base <= 0xc0 && this.supported.has(base); base += 0x20) {
        const cmd = `01${hex2(base)}`;
        const more = decodeSupportedPids(this.parse(await this.send(cmd), cmd), base);
        for (const pid of more) this.supported.add(pid);
      }
    }
    return this.info;
  }

  /**
   * True when the reply contains `service pid`. Falls back to header-less
   * parsing for clones that accept ATH1 but don't print headers.
   */
  private hasReply(raw: string, command: string, service: number, pid: number): boolean {
    const match = (msgs: ObdMessage[]) =>
      msgs.some((m) => m.data[0] === service && m.data[1] === pid);
    if (match(this.parse(raw, command))) return true;
    if (this.headers) {
      const plain = parseObdMessages(raw, { protocol: this.info.protocol, headers: false, command });
      if (match(plain)) {
        this.headers = false;
        return true;
      }
    }
    return false;
  }

  private isSupported(pid: number): boolean {
    // Some ECUs report an empty bitmap; try anyway in that case.
    return this.supported.size === 0 || this.supported.has(pid);
  }

  async readPid(pid: number): Promise<number | null> {
    if (!this.isSupported(pid)) return null;
    const cmd = `01${hex2(pid)}`;
    const bytes = findPidBytes(this.parse(await this.send(cmd), cmd), pid);
    return bytes ? decodePidValue(pid, bytes) : null;
  }

  async readPids(pids: number[]): Promise<Map<number, number>> {
    const out = new Map<number, number>();
    for (const pid of pids) {
      const value = await this.readPid(pid);
      if (value != null) out.set(pid, value);
    }
    return out;
  }

  async readReadiness(): Promise<ObdReadiness | null> {
    const bytes = findPidBytes(this.parse(await this.send("0101"), "0101"), 0x01);
    return bytes ? decodeMonitorStatus(bytes) : null;
  }

  async readDtcs(kind: DtcKind): Promise<DecodedDtc[]> {
    const cmd = DTC_REQUEST[kind];
    const raw = await this.send(cmd, 5_000);
    return decodeDtcMessages(this.parse(raw, cmd), kind, this.info.protocol);
  }

  async readFreezeFrame(): Promise<ElmScanResult["freezeFrame"]> {
    const dtc = decodeFreezeFrameDtc(this.parse(await this.send("020200"), "020200"));
    const values: FreezeFrameValue[] = [];
    for (const pid of FREEZE_FRAME_PIDS) {
      if (!this.isSupported(pid)) continue;
      const cmd = `02${hex2(pid)}00`;
      const bytes = findPidBytes(this.parse(await this.send(cmd), cmd), pid, 0x02);
      const value = bytes ? decodePidValue(pid, bytes) : null;
      if (value != null) values.push({ pid, value, ...PID_INFO[pid] });
    }
    if (!dtc && !values.length) return null;
    return { dtc, values };
  }

  async readVin(): Promise<string | null> {
    const raw = await this.send("0902", 6_000);
    return decodeVin(this.parse(raw, "0902"));
  }

  /**
   * SAE J1979 Mode 04 — clear/reset emission-related diagnostic info.
   * Clears stored (Mode 03) codes and readiness monitors; pending may clear;
   * permanent (Mode 0A) codes are not cleared by the standard.
   * Requires ignition ON (engine usually OFF). Verifies by re-reading Mode 03.
   */
  async clearDtcs(): Promise<{
    ok: boolean;
    acknowledged: boolean;
    remainingStored: number;
    remainingPermanent: number;
    message: string;
  }> {
    const raw = await this.send("04", 10_000);
    if (isClearDtcHardFailure(raw)) {
      const err = detectElmError(raw);
      return {
        ok: false,
        acknowledged: false,
        remainingStored: -1,
        remainingPermanent: -1,
        message:
          err === "unable_to_connect" || err === "no_data"
            ? "The car did not accept a clear request. Keep ignition ON (engine off is fine), then try again."
            : `Clear failed (${(err ?? "error").replace(/_/g, " ")}).`,
      };
    }

    const acknowledged = isClearDtcAcknowledged(raw, this.parse(raw, "04"));
    // Give the ECU a moment before verifying stored codes.
    await sleep(400);
    const stored = await this.readDtcs("stored");
    let permanent: DecodedDtc[] = [];
    try {
      permanent = await this.readDtcs("permanent");
    } catch {
      permanent = [];
    }

    const remainingStored = stored.length;
    const remainingPermanent = permanent.length;
    if (remainingStored === 0) {
      return {
        ok: true,
        acknowledged,
        remainingStored,
        remainingPermanent,
        message:
          remainingPermanent > 0
            ? "Stored codes cleared. Permanent codes can remain until the car re-tests itself."
            : "Stored fault codes cleared.",
      };
    }
    if (acknowledged) {
      return {
        ok: true,
        acknowledged,
        remainingStored,
        remainingPermanent,
        message: `Clear acknowledged, but ${remainingStored} stored code(s) are still present.`,
      };
    }
    return {
      ok: false,
      acknowledged: false,
      remainingStored,
      remainingPermanent,
      message:
        "Could not confirm that codes were cleared. Record codes first, then retry with ignition ON.",
    };
  }

  /** Full DIY scan. Each step is isolated so one unsupported mode can't sink the rest. */
  async scan(options: {
    sensorPids: number[];
    onStep?: (step: ObdScanStep) => void;
  }): Promise<ElmScanResult> {
    const warnings: string[] = [];
    const attempt = async <T>(label: string, fn: () => Promise<T>, fallback: T) => {
      try {
        return await fn();
      } catch (err) {
        if (err instanceof ObdSessionError && err.code === "disconnected") throw err;
        warnings.push(`${label}: ${err instanceof Error ? err.message : String(err)}`);
        return fallback;
      }
    };

    options.onStep?.("readiness");
    const readiness = await attempt("readiness", () => this.readReadiness(), null);

    options.onStep?.("codes");
    const dtcs: DecodedDtc[] = [];
    for (const kind of ["stored", "pending", "permanent"] as const) {
      dtcs.push(...(await attempt(kind, () => this.readDtcs(kind), [] as DecodedDtc[])));
    }

    let freezeFrame: ElmScanResult["freezeFrame"] = null;
    if (readiness?.milOn || dtcs.some((d) => d.kind === "stored")) {
      options.onStep?.("freeze_frame");
      freezeFrame = await attempt("freeze_frame", () => this.readFreezeFrame(), null);
    }

    options.onStep?.("sensors");
    const pids = await attempt(
      "sensors",
      () => this.readPids([...options.sensorPids, 0x31, 0xa6]),
      new Map<number, number>(),
    );
    const voltage = parseAdapterVoltage(await this.send("ATRV"));
    if (voltage != null) this.info.batteryVoltage = voltage;

    options.onStep?.("vin");
    const vin = await attempt("vin", () => this.readVin(), null);

    return { readiness, dtcs, freezeFrame, pids, vin, warnings };
  }
}
