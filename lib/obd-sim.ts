/**
 * Scripted ELM327 adapter for QA / no-hardware testing.
 * Never used for ordinary accounts — see `canUseObdSimulator`.
 */

import { isLongLivedQaTrialEmail } from "@/lib/qa-test-account";
import type { ObdTransport } from "@/lib/obd-transport";

export type ObdSimScenarioId =
  | "camry_2018"
  | "ready_no_codes"
  | "ignition_off"
  | "adapter_silent"
  | "occupied";

export type ObdSimScenarioMeta = {
  id: ObdSimScenarioId;
  /** Short label for the QA device list */
  label: string;
  /** What this scenario exercises */
  note: string;
};

export const OBD_SIM_SCENARIOS: ObdSimScenarioMeta[] = [
  {
    id: "camry_2018",
    label: "Sim: 2018 Camry (P0171 + P0420)",
    note: "Happy path — MIL on, readiness, freeze frame, VIN, sensors",
  },
  {
    id: "ready_no_codes",
    label: "Sim: no codes + ready",
    note: "MIL off, monitors ready — smog-ready style scan",
  },
  {
    id: "ignition_off",
    label: "Sim: ignition OFF",
    note: "Adapter answers AT; car bus does not (no_ecu)",
  },
  {
    id: "adapter_silent",
    label: "Sim: non-ELM / silent",
    note: "Bluetooth connects but no ELM327 banner (adapter_silent)",
  },
  {
    id: "occupied",
    label: "Sim: adapter busy",
    note: "Other app holding the link (gatt / disconnect style error)",
  },
];

/** Primary QA email, or local/preview with NEXT_PUBLIC_OBD_SIM=1. */
export function canUseObdSimulator(email?: string | null): boolean {
  if (isLongLivedQaTrialEmail(email)) return true;
  if (typeof process === "undefined") return false;
  const raw =
    process.env.NEXT_PUBLIC_OBD_SIM?.trim() ?? process.env.OBD_SIM?.trim() ?? "";
  return raw === "1" || raw === "true" || raw === "yes";
}

/** 2018 Camry-style CAN fixture used by unit tests and QA sim. */
export const OBD_SIM_CAMRY_2018: Record<string, string | string[]> = {
  ATZ: "\r\rELM327 v1.5\r\r>",
  ATRV: "12.6V\r\r>",
  "0100":
    "SEARCHING...\r7E8 06 41 00 BE 3E B8 13\r7E9 06 41 00 98 18 80 01\r\r>",
  "0120": "7E8 06 41 20 80 01 A0 01\r\r>",
  "0140": "7E8 06 41 40 40 00 00 01\r\r>",
  "0160": "7E8 06 41 60 00 00 00 01\r\r>",
  "0180": "7E8 06 41 80 00 00 00 01\r\r>",
  "01A0": "7E8 06 41 A0 04 00 00 00\r\r>",
  ATDPN: "A6\r\r>",
  "0101": "7E8 06 41 01 81 07 65 04\r\r>",
  "03": "7E8 04 43 01 01 71\r\r>",
  "07": "7E8 04 47 01 04 20\r7E9 02 47 00\r\r>",
  "0A": "7E8 04 4A 01 01 71\r\r>",
  // Mode 04 clear — QA can clear then Read again (codes still scripted until reload)
  "04": "7E8 01 44\r\r>",
  "020200": "7E8 05 42 02 00 01 71\r\r>",
  "020400": "7E8 04 42 04 00 66\r\r>",
  "020500": "7E8 04 42 05 00 7B\r\r>",
  "020600": "7E8 04 42 06 00 98\r\r>",
  "020700": "7E8 04 42 07 00 A3\r\r>",
  "020C00": "7E8 05 42 0C 00 0B B8\r\r>",
  "0105": "7E8 03 41 05 5A\r\r>",
  "010C": "7E8 04 41 0C 0B B8\r\r>",
  "010D": "7E8 03 41 0D 00\r\r>",
  "0111": "7E8 03 41 11 26\r\r>",
  "0142": "7E8 04 41 42 37 6E\r\r>",
  "0131": "7E8 04 41 31 01 F4\r\r>",
  "01A6": "7E8 06 41 A6 00 07 01 B6\r\r>",
  "0902":
    "7E8 10 14 49 02 01 34 54 31\r7E8 21 42 31 31 48 4B 35 4A\r7E8 22 55 31 32 33 34 35 36\r\r>",
};

const READY_NO_CODES: Record<string, string | string[]> = {
  ATZ: "\r\rELM327 v1.5\r\r>",
  ATRV: "12.4V\r\r>",
  "0100": "7E8 06 41 00 BE 3E B8 13\r\r>",
  "0120": "7E8 06 41 20 80 01 A0 01\r\r>",
  "0140": "7E8 06 41 40 40 00 00 01\r\r>",
  "0160": "7E8 06 41 60 00 00 00 01\r\r>",
  "0180": "7E8 06 41 80 00 00 00 01\r\r>",
  "01A0": "7E8 06 41 A0 04 00 00 00\r\r>",
  ATDPN: "A6\r\r>",
  // MIL off, 0 DTCs, spark monitors complete (C/D = 0)
  "0101": "7E8 06 41 01 00 07 65 00\r\r>",
  "03": "7E8 02 43 00\r\r>",
  "07": "7E8 02 47 00\r\r>",
  "0A": "7E8 02 4A 00\r\r>",
  "0105": "7E8 03 41 05 64\r\r>",
  "010C": "7E8 04 41 0C 1F 40\r\r>",
  "010D": "7E8 03 41 0D 00\r\r>",
  "0111": "7E8 03 41 11 00\r\r>",
  "0142": "7E8 04 41 42 30 D4\r\r>",
  "0131": "7E8 04 41 31 00 64\r\r>",
  "01A6": "7E8 06 41 A6 00 01 86 A0\r\r>",
  "0902":
    "7E8 10 14 49 02 01 34 54 31\r7E8 21 42 31 31 48 4B 35 4A\r7E8 22 55 39 39 39 39 39 39\r\r>",
};

const IGNITION_OFF: Record<string, string | string[]> = {
  ATZ: "\r\rELM327 v1.5\r\r>",
  ATRV: "12.1V\r\r>",
  "0100": ["SEARCHING...\rUNABLE TO CONNECT\r\r>", "NO DATA\r\r>"],
  ATDPN: "A0\r\r>",
};

const ADAPTER_SILENT: Record<string, string | string[]> = {
  ATZ: "\r>",
  ATI: ">",
};

function repliesFor(scenario: ObdSimScenarioId): Record<string, string | string[]> {
  switch (scenario) {
    case "camry_2018":
      return { ...OBD_SIM_CAMRY_2018 };
    case "ready_no_codes":
      return { ...READY_NO_CODES };
    case "ignition_off":
      return { ...IGNITION_OFF };
    case "adapter_silent":
      return { ...ADAPTER_SILENT };
    case "occupied":
      return { ...OBD_SIM_CAMRY_2018 };
    default:
      return { ...OBD_SIM_CAMRY_2018 };
  }
}

/**
 * Byte-pipe that answers like a cheap ELM327 over BLE (chunked optional).
 */
export class SimulatedElmTransport implements ObdTransport {
  readonly kind = "mock" as const;
  connected = true;
  sent: string[] = [];
  private data = new Set<(chunk: string) => void>();
  private dc = new Set<() => void>();

  constructor(
    private replies: Record<string, string | string[]>,
    readonly deviceName: string,
    private chunkSize = 20,
    private readonly searchDelayMs = 80,
  ) {}

  async write(text: string): Promise<void> {
    const cmd = text.trim();
    this.sent.push(cmd);
    const scripted = this.replies[cmd];
    const reply = Array.isArray(scripted)
      ? scripted.length > 1
        ? scripted.shift()
        : scripted[0]
      : scripted;
    const out = reply ?? (cmd.startsWith("AT") ? "OK\r\r>" : "NO DATA\r\r>");
    const delay = cmd === "0100" ? this.searchDelayMs : 20;
    const chunks =
      this.chunkSize > 0
        ? out.match(new RegExp(`[\\s\\S]{1,${this.chunkSize}}`, "g")) ?? []
        : [out];
    chunks.forEach((c, i) =>
      setTimeout(() => {
        for (const l of this.data) l(c);
      }, delay + i),
    );
  }

  onData(listener: (chunk: string) => void): () => void {
    this.data.add(listener);
    return () => this.data.delete(listener);
  }

  onDisconnect(listener: () => void): () => void {
    this.dc.add(listener);
    return () => this.dc.delete(listener);
  }

  disconnect(): void {
    this.connected = false;
    for (const l of this.dc) l();
  }
}

export async function requestSimulatedTransport(options: {
  scenario: ObdSimScenarioId;
}): Promise<ObdTransport> {
  if (options.scenario === "occupied") {
    await new Promise((r) => setTimeout(r, 200));
    throw new Error(
      "GATT operation failed — device disconnected. Close other OBD apps that may hold the adapter.",
    );
  }
  const meta = OBD_SIM_SCENARIOS.find((s) => s.id === options.scenario);
  return new SimulatedElmTransport(
    repliesFor(options.scenario),
    meta?.label ?? "OBDII (simulated)",
  );
}
