/**
 * In-app OBD compatibility self-check: ATI + protocol + one 0100.
 * Produces a short shareable report for support (no full scan).
 */

import {
  ElmSession,
  ObdSessionError,
  type ElmAdapterInfo,
} from "@/lib/obd-elm";
import type { ObdTransport } from "@/lib/obd-transport";

export type ObdSelfCheckResult = {
  ok: boolean;
  reportText: string;
  adapterVersion: string | null;
  protocolId: string | null;
  protocolLabel: string | null;
  pid0100Ok: boolean;
  error: string | null;
};

export type ObdProtocolChoice = {
  /** ELM ATSP digit/letter: "0" | "1"…"9" | "A"…"C" */
  id: string;
  label: string;
  /** Short UI label for common presets */
  preset?: boolean;
};

/** Manual ATSP choices (0 = auto). Presets highlighted in UI. */
export const OBD_PROTOCOL_CHOICES: ObdProtocolChoice[] = [
  { id: "0", label: "Automatic (ATSP0)", preset: true },
  { id: "6", label: "ISO 15765-4 CAN 11-bit 500k", preset: true },
  { id: "7", label: "ISO 15765-4 CAN 29-bit 500k", preset: true },
  { id: "8", label: "ISO 15765-4 CAN 11-bit 250k", preset: true },
  { id: "3", label: "ISO 9141-2", preset: true },
  { id: "1", label: "SAE J1850 PWM" },
  { id: "2", label: "SAE J1850 VPW" },
  { id: "4", label: "ISO 14230-4 KWP (5 baud)" },
  { id: "5", label: "ISO 14230-4 KWP (fast)" },
  { id: "9", label: "ISO 15765-4 CAN 29-bit 250k" },
  { id: "A", label: "SAE J1939 CAN" },
  { id: "B", label: "User CAN 11-bit" },
  { id: "C", label: "User CAN 29-bit" },
];

function formatReport(input: {
  deviceName: string;
  transportKind: string;
  platform: string;
  info: ElmAdapterInfo;
  pid0100Ok: boolean;
  error: string | null;
}): string {
  const lines = [
    "Garage Genius OBD self-check",
    `When: ${new Date().toISOString()}`,
    `Platform: ${input.platform}`,
    `Transport: ${input.transportKind}`,
    `Device: ${input.deviceName}`,
    `Adapter (ATI): ${input.info.version ?? "(empty)"}`,
    `Protocol (ATDPN): ${
      input.info.protocol
        ? `${input.info.protocol.id} — ${input.info.protocol.label}`
        : "(unknown)"
    }`,
    `Battery (ATRV): ${
      input.info.batteryVoltage != null
        ? `${input.info.batteryVoltage.toFixed(1)} V`
        : "(n/a)"
    }`,
    `0100 ECU reply: ${input.pid0100Ok ? "OK" : "FAIL"}`,
  ];
  if (input.error) lines.push(`Error: ${input.error}`);
  lines.push("", "Paste this text to Garage Genius support if you need help.");
  return lines.join("\n");
}

/**
 * Run a short ELM handshake on an already-connected transport.
 * Does not dispose the transport — caller owns disconnect.
 */
export async function runObdSelfCheck(input: {
  transport: ObdTransport;
  platform?: string;
  protocol?: string;
}): Promise<ObdSelfCheckResult> {
  const session = new ElmSession(input.transport);
  try {
    await session.initialize(undefined, {
      protocol: input.protocol,
      skipSupportedPidWalk: true,
    });
    const reportText = formatReport({
      deviceName: input.transport.deviceName,
      transportKind: input.transport.kind,
      platform: input.platform ?? "unknown",
      info: session.info,
      pid0100Ok: true,
      error: null,
    });
    return {
      ok: true,
      reportText,
      adapterVersion: session.info.version,
      protocolId: session.info.protocol?.id ?? null,
      protocolLabel: session.info.protocol?.label ?? null,
      pid0100Ok: true,
      error: null,
    };
  } catch (err) {
    const message =
      err instanceof ObdSessionError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
    const reportText = formatReport({
      deviceName: input.transport.deviceName,
      transportKind: input.transport.kind,
      platform: input.platform ?? "unknown",
      info: session.info,
      pid0100Ok: false,
      error: message,
    });
    return {
      ok: false,
      reportText,
      adapterVersion: session.info.version,
      protocolId: session.info.protocol?.id ?? null,
      protocolLabel: session.info.protocol?.label ?? null,
      pid0100Ok: false,
      error: message,
    };
  } finally {
    session.dispose();
  }
}
