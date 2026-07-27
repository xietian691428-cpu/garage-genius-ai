/**
 * DTC parse / lookup / diagnosis prompts for Chat + Check Engine coach entry.
 * Does not touch CoachScenarioPlayer playbook JSON.
 */

import type {
  DtcFamily,
  DtcLookupResult,
  DtcPlaybookMatch,
  DtcSeverity,
  ParsedDtc,
} from "@/lib/types/dtc";

/** Same shape as chat starter / follow-up chips (kept local to avoid circular imports). */
export type DtcChip = {
  id: string;
  label: string;
  prompt: string;
};

/** OBD-II style: P0300, C1234, B0001, U0100 (hex digits allowed). */
export const DTC_CODE_REGEX = /\b([PCBU])([0-9A-Fa-f]{4})\b/g;

const DTC_CATALOG: Record<
  string,
  { desc: string; severity: DtcSeverity }
> = {
  P0101: { desc: "MAF Circuit Range/Performance", severity: "Moderate" },
  P0171: { desc: "System Too Lean (Bank 1)", severity: "Moderate" },
  P0174: { desc: "System Too Lean (Bank 2)", severity: "Moderate" },
  P0300: { desc: "Random/Multiple Cylinder Misfire", severity: "High" },
  P0301: { desc: "Cylinder 1 Misfire Detected", severity: "High" },
  P0302: { desc: "Cylinder 2 Misfire Detected", severity: "High" },
  P0303: { desc: "Cylinder 3 Misfire Detected", severity: "High" },
  P0304: { desc: "Cylinder 4 Misfire Detected", severity: "High" },
  P0420: {
    desc: "Catalyst System Efficiency Below Threshold (Bank 1)",
    severity: "Moderate",
  },
  P0430: {
    desc: "Catalyst System Efficiency Below Threshold (Bank 2)",
    severity: "Moderate",
  },
  P0442: { desc: "EVAP System Small Leak Detected", severity: "Low" },
  P0455: { desc: "EVAP System Large Leak Detected", severity: "Low" },
  P0456: { desc: "EVAP System Very Small Leak", severity: "Low" },
  P0457: { desc: "EVAP Leak (Fuel Cap Loose/Off)", severity: "Low" },
  P0500: { desc: "Vehicle Speed Sensor Malfunction", severity: "Moderate" },
  P0700: {
    desc: "Transmission Control System Malfunction (request)",
    severity: "Moderate",
  },
  P0128: { desc: "Coolant Thermostat (Coolant Temp Below Thermostat Regulating Temperature)", severity: "Low" },
  P0401: { desc: "EGR Flow Insufficient", severity: "Moderate" },
  P0113: { desc: "IAT Sensor Circuit High Input", severity: "Low" },
  P0135: { desc: "O2 Sensor Heater Circuit (Bank 1 Sensor 1)", severity: "Moderate" },
  P0141: { desc: "O2 Sensor Heater Circuit (Bank 1 Sensor 2)", severity: "Moderate" },
  P0507: { desc: "Idle Control System RPM Higher Than Expected", severity: "Low" },
  P0562: { desc: "System Voltage Low", severity: "Moderate" },
  C0035: { desc: "Left Front Wheel Speed Sensor Circuit", severity: "Moderate" },
  C0040: { desc: "Right Front Wheel Speed Sensor Circuit", severity: "Moderate" },
  C0121: { desc: "ABS Module / Speed Sensor Related", severity: "Info" },
  B0028: { desc: "Right Side Airbag Deployment Control", severity: "High" },
  U0100: {
    desc: "Lost Communication With ECM/PCM",
    severity: "High",
  },
  U0101: {
    desc: "Lost Communication With TCM",
    severity: "High",
  },
  U0121: {
    desc: "Lost Communication With ABS Control Module",
    severity: "Moderate",
  },
};

export function normalizeDtcCode(raw: string): string | null {
  const m = raw.trim().toUpperCase().match(/^([PCBU])([0-9A-F]{4})$/);
  if (!m) return null;
  return `${m[1]}${m[2]}`;
}

export function extractDtcCodes(text: string): string[] {
  if (!text) return [];
  const found = new Set<string>();
  const re = new RegExp(DTC_CODE_REGEX.source, "g");
  for (const m of text.matchAll(re)) {
    found.add(`${m[1].toUpperCase()}${m[2].toUpperCase()}`);
  }
  return [...found];
}

export function lookupDtc(code: string): ParsedDtc {
  const normalized = normalizeDtcCode(code) || code.trim().toUpperCase();
  const family = (normalized[0] as DtcFamily) || "P";
  const hint = DTC_CATALOG[normalized];
  return {
    code: normalized,
    family,
    desc: hint?.desc ?? "Diagnostic trouble code (see OEM definition for this vehicle)",
    severity: hint?.severity ?? "Moderate",
  };
}

export function lookupDtcsFromText(text: string): DtcLookupResult {
  const codes = extractDtcCodes(text).map(lookupDtc);
  const primary = codes[0] ?? null;
  return {
    codes,
    primary,
    playbook: primary ? matchPlaybookForDtc(primary) : null,
  };
}

/** Soft playbook match — Chat can suggest opening the guide; no hard filter. */
export function matchPlaybookForDtc(dtc: ParsedDtc): DtcPlaybookMatch {
  if (dtc.family === "C") {
    return {
      slug: "maintenance_brakes",
      reason: "Chassis/ABS-related code — brake/ABS guided checks often apply first.",
    };
  }
  if (dtc.family === "B") {
    return {
      slug: "diagnosis_check_engine",
      reason: "Body module code — confirm with scan data; Check Engine flow still helps structure DIY checks.",
    };
  }
  if (dtc.family === "U") {
    return {
      slug: "diagnosis_check_engine",
      reason: "Network/comms code — start with battery/grounds then module scan path.",
    };
  }
  // Powertrain → Check Engine playbook
  return {
    slug: "diagnosis_check_engine",
    reason: "Powertrain DTC — Check Engine / OBD guided playbook fits best.",
  };
}

export function formatDtcConfirmLine(codes: ParsedDtc[]): string {
  if (!codes.length) return "No fault codes detected.";
  if (codes.length === 1) {
    const c = codes[0];
    return `Detected fault code ${c.code} (${c.desc}). Likely causes and safe DIY checks follow.`;
  }
  const list = codes.map((c) => `${c.code}`).join(", ");
  return `Detected fault codes ${list}. Primary focus: ${codes[0].code} (${codes[0].desc}). Likely causes and safe DIY checks follow.`;
}

/**
 * User/assistant-facing diagnosis prompt after code entry or OBD OCR.
 */
export function buildDtcDiagnosisPrompt(options: {
  codes: ParsedDtc[];
  source: "manual" | "obd_screenshot" | "chat_text";
  vehicleLabel?: string;
}): string {
  const { codes, source, vehicleLabel } = options;
  const confirm = formatDtcConfirmLine(codes);
  const codeBlock = codes
    .map((c) => `- ${c.code}: ${c.desc} (severity: ${c.severity})`)
    .join("\n");
  const playbook = codes[0] ? matchPlaybookForDtc(codes[0]) : null;
  const sourceLine =
    source === "obd_screenshot"
      ? "Codes were read from an OBD scanner / dash photo (OCR)."
      : source === "manual"
        ? "Codes were entered manually by the owner."
        : "Codes appeared in the owner's message.";

  return [
    confirm,
    "",
    sourceLine,
    vehicleLabel ? `Vehicle: ${vehicleLabel}.` : "",
    "",
    "Codes:",
    codeBlock,
    "",
    "Please diagnose with this structure:",
    "1) Confirm the code meaning in plain English for a DIY owner.",
    "2) Top 3 most likely causes for THIS vehicle (ranked), with one safe DIY check each.",
    "3) Solution path: what to verify before buying parts; when to stop DIY / see a shop.",
    "4) Mention the best Coach playbook theme if relevant" +
      (playbook ? ` (suggest: ${playbook.slug} — ${playbook.reason})` : "") +
      ".",
    "Do not invent OEM torque specs or freeze-frame data you do not have. Ask at most one clarifying question if critical.",
  ]
    .filter((line) => line !== undefined)
    .join("\n");
}

export const DTC_FOLLOW_UP_CHIPS: DtcChip[] = [
  {
    id: "dtc-explain",
    label: "Explain this code",
    prompt:
      "Explain this fault code in plain English for a DIY owner on THIS vehicle. What systems does it involve, how urgent is it, and what should I NOT ignore?",
  },
  {
    id: "dtc-checks",
    label: "Check steps",
    prompt:
      "Give a prioritized DIY checklist for this fault code (safe order). For each step: what to look for and what it means. Problem → Checks → Solution path.",
  },
  {
    id: "dtc-parts",
    label: "Need parts?",
    prompt:
      "Based on this fault code and my vehicle, do I need parts yet? If yes, recommend fitment-aware parts with OEM/aftermarket notes and purchase links ([[PARTS_DATA]] when ready). If not, say what to verify first.",
  },
];

export function getDtcFollowUpChips(): DtcChip[] {
  return [...DTC_FOLLOW_UP_CHIPS];
}

/** True if text looks like a DTC-focused reply / user message. */
export function textHasDtcSignal(text?: string | null): boolean {
  if (!text) return false;
  if (extractDtcCodes(text).length > 0) return true;
  return /fault code|dtc|check engine|obd|trouble code/i.test(text);
}

/** Validate a single typed code (for modal). */
export function isValidDtcInput(raw: string): boolean {
  return Boolean(normalizeDtcCode(raw));
}
