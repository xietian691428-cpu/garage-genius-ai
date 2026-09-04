/**
 * DTC parse / lookup / diagnosis prompts for Chat + Check Engine coach entry.
 * Does not touch CoachScenarioPlayer playbook JSON.
 */

import type {
  DtcFamily,
  DtcLookupResult,
  DtcPlaybookMatch,
  ParsedDtc,
} from "@/lib/types/dtc";
import {
  extractDtcCodes,
} from "@/lib/dtc-parse";
import {
  lookupLocalDtc,
  severityHintToDtcSeverity,
} from "@/lib/vehicle-data/dtc-local";
import { getCoachPlaybook } from "@/lib/coach-scenarios/catalog";

export {
  DTC_CODE_REGEX,
  compactDtcInput,
  extractDtcCodes,
  extractDtcCodesFromAny,
  isValidDtcInput,
  normalizeDtcCode,
} from "@/lib/dtc-parse";

/** Same shape as chat starter / follow-up chips (kept local to avoid circular imports). */
export type DtcChip = {
  id: string;
  label: string;
  prompt: string;
  /** Opens Coach Library to this production slug — does not change Player internals. */
  playbookSlug?: string;
};

export function lookupDtc(code: string): ParsedDtc {
  const local = lookupLocalDtc(code);
  const family = (local.code[0] as DtcFamily) || "P";
  return {
    code: local.code,
    family,
    desc: local.title,
    severity: severityHintToDtcSeverity(local.severityHint),
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
  const code = dtc.code.toUpperCase();
  if (code === "P0420" || code === "P0430") {
    return {
      slug: "diagnosis_exhaust_emissions",
      reason:
        "Catalyst / efficiency code — exhaust & emissions guided checks fit better than brakes.",
    };
  }
  if (/^P030[0-8]$/.test(code)) {
    return {
      slug: "diagnosis_check_engine",
      reason: "Misfire family — Check Engine guided checks first (not brake pads).",
    };
  }
  if (code === "P0171" || code === "P0174") {
    return {
      slug: "diagnosis_check_engine",
      reason: "Fuel-trim / lean family — intake and fuel checks, not brake pads.",
    };
  }
  if (code === "P0455" || code === "P0456" || code === "P0442" || code === "P0440" || code === "P0446" || code === "P0496") {
    return {
      slug: "diagnosis_check_engine",
      reason: "EVAP family — leak checks and cap/hoses, not brake pads.",
    };
  }
  if (code === "U0100" || code === "U0101" || code === "U0121") {
    return {
      slug: "diagnosis_electrical_lights_sensors",
      reason: "Network / lost-comm code — battery, grounds, then module scan path.",
    };
  }
  if (dtc.family === "C") {
    return {
      slug: "maintenance_brakes",
      reason: "Chassis/ABS-related code — brake/ABS guided checks often apply first.",
    };
  }
  if (dtc.family === "B") {
    return {
      slug: "diagnosis_check_engine",
      reason:
        "Body module code — confirm with scan data; Check Engine flow still helps structure DIY checks.",
    };
  }
  if (dtc.family === "U") {
    return {
      slug: "diagnosis_electrical_lights_sensors",
      reason: "Network/comms code — start with battery/grounds then module scan path.",
    };
  }
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
  source: "manual" | "obd_screenshot" | "chat_text" | "obd_bluetooth";
  vehicleLabel?: string;
  /** Optional live snapshot lines from BLE OBD */
  liveContext?: string[];
}): string {
  const { codes, source, vehicleLabel, liveContext } = options;
  const confirm =
    codes.length > 0
      ? formatDtcConfirmLine(codes)
      : source === "obd_bluetooth"
        ? "Bluetooth OBD connected — no stored/pending fault codes reported. Review live sensors and suggest safe DIY checks."
        : formatDtcConfirmLine(codes);
  const codeBlock = codes.length
    ? codes
        .map((c) => `- ${c.code}: ${c.desc} (severity: ${c.severity})`)
        .join("\n")
    : "- (none)";
  const playbook = codes[0] ? matchPlaybookForDtc(codes[0]) : {
    slug: "diagnosis_check_engine",
    reason: "No codes — still use Check Engine guided flow if the light is on.",
  };
  const sourceLine =
    source === "obd_screenshot"
      ? "Codes are user-provided from an OBD scanner / dash photo (OCR). This is not a live Bluetooth adapter feed."
      : source === "obd_bluetooth"
        ? "Codes and sensors were read live over Bluetooth OBD-II (ELM327 BLE)."
        : source === "manual"
          ? "Codes are user-provided (typed or pasted by the owner). This is not live/realtime OBD data."
          : "Codes are user-provided from the owner's message. This is not live/realtime OBD data.";

  return [
    confirm,
    "",
    sourceLine,
    vehicleLabel ? `Vehicle: ${vehicleLabel}.` : "",
    "",
    "Codes:",
    codeBlock,
    ...(liveContext?.length
      ? ["", "Live OBD context:", ...liveContext.map((l) => `- ${l}`)]
      : []),
    "",
    "Please diagnose with this structure:",
    "Meaning: confirm each code in plain English from [DTC_REF] only (unknown codes stay generic — do not invent an OEM title).",
    "Likely causes: a short list of educational possibilities, not a verdict. Never say Replace X now, It's definitely, or Must be the…",
    "Checks: observe → basic → advanced → shop, matching diy_level.",
    "When to go to a shop: flashing MIL, safety lights, diy_level=shop, or failed basic checks.",
    codes.length > 1
      ? "Multiple codes: list every local REF first, then check order. Safety (SRS/ABS/lost-comm, shop) before pure emissions (catalyst/EVAP)."
      : "",
    codes.some((c) => lookupLocalDtc(c.code).diyLevel === "shop")
      ? "At least one code is diy_level=shop: prefer a shop path; DIY is observe-only."
      : "",
    playbook
      ? `Mention the best Coach playbook theme if relevant (suggest: ${playbook.slug} — ${playbook.reason}).`
      : "",
    "Do not invent OEM torque specs, fluid quarts, or freeze-frame data you do not have. Ask at most one clarifying question if critical.",
  ]
    .filter((line) => Boolean(line))
    .join("\n");
}

/** Build Chat diagnosis prompt from a BLE OBD session snapshot. */
export function buildObdBleDiagnosisPrompt(options: {
  deviceName: string;
  codes: Array<{ code: string; desc?: string; severity?: string }>;
  vehicleLabel?: string;
  sensors?: {
    rpm?: number | null;
    coolantC?: number | null;
    voltage?: number | null;
    speedKph?: number | null;
    throttlePct?: number | null;
    oilTempC?: number | null;
  } | null;
  odometerKm?: number | null;
  distanceSinceCodesClearedKm?: number | null;
}): string {
  const parsed = options.codes.map((c) => lookupDtc(c.code));
  const live: string[] = [`Adapter: ${options.deviceName}`];
  if (options.odometerKm != null) {
    live.push(`Odometer (PID A6): ${options.odometerKm.toLocaleString()} km`);
  }
  if (options.distanceSinceCodesClearedKm != null) {
    live.push(
      `Distance since codes cleared (PID 31): ${options.distanceSinceCodesClearedKm.toLocaleString()} km`,
    );
  }
  const s = options.sensors;
  if (s) {
    if (s.rpm != null) live.push(`RPM: ${s.rpm}`);
    if (s.coolantC != null) live.push(`Coolant: ${s.coolantC}°C`);
    if (s.voltage != null) live.push(`Module voltage: ${s.voltage} V`);
    if (s.speedKph != null) live.push(`Speed: ${s.speedKph} km/h`);
    if (s.throttlePct != null) live.push(`Throttle: ${s.throttlePct}%`);
    if (s.oilTempC != null) live.push(`Oil temp: ${s.oilTempC}°C`);
  }

  return buildDtcDiagnosisPrompt({
    codes: parsed,
    source: "obd_bluetooth",
    vehicleLabel: options.vehicleLabel,
    liveContext: live,
  });
}

export const DTC_FOLLOW_UP_CHIPS: DtcChip[] = [
  {
    id: "dtc-explain",
    label: "Explain this code",
    prompt:
      "Explain this fault code in plain English for a DIY owner on THIS vehicle. What systems does it involve, how urgent is it, and what should I NOT ignore? Do not invent OEM definitions.",
  },
  {
    id: "dtc-checks",
    label: "Check steps",
    prompt:
      "Give a prioritized DIY checklist for this fault code (observe → basic → advanced → shop). Educational only — do not say a specific part must be replaced now.",
  },
  {
    id: "dtc-shop",
    label: "When to stop DIY",
    prompt:
      "When should I stop DIY for this code and see a shop? Safety lights, flashing MIL, and what to record. Do not invent torque or OEM part numbers.",
  },
];

const UNKNOWN_DTC_CHIPS: DtcChip[] = [
  {
    id: "dtc-unknown-record",
    label: "Record this code",
    prompt:
      "This code is not in the local catalog. Tell me to record it exactly, not ignore safety-related lights, and that a dealer/shop should interpret the OEM meaning. Do not invent a title, TSB, or root cause.",
  },
  {
    id: "dtc-unknown-safety",
    label: "Safety first",
    prompt:
      "For an unknown fault code: what warning lights or symptoms mean stop driving vs continue recording data? Educational only — no Replace X now.",
  },
  {
    id: "dtc-unknown-shop",
    label: "Shop interprets OEM",
    prompt:
      "Explain that an unknown code needs OEM-level interpretation at a shop or dealer. Do not invent a diagnosis from the code letters alone.",
  },
];

function playbookChipForCode(code: string): DtcChip | null {
  const parsed = lookupDtc(code);
  const match = matchPlaybookForDtc(parsed);
  const guide = getCoachPlaybook(match.slug);
  if (!guide) return null;
  const title = guide.title.replace(/^Coach:\s*/i, "").trim() || match.slug;
  return {
    id: `dtc-guide-${match.slug}`,
    label: `Open ${title} guide`,
    playbookSlug: match.slug,
    prompt: `Open the ${match.slug} coach guide for ${parsed.code}. First safe checks only. Do not invent torque, fluid capacity, or OEM part numbers. Do not talk about brake pads unless this is a chassis/ABS code.`,
  };
}

/**
 * Follow-up chips after a DTC hit. Emissions codes never get brake-pad chips.
 * Catalog hits can deep-link a production playbook; unknown codes stay generic.
 */
export function getDtcFollowUpChips(sourceText?: string | null): DtcChip[] {
  const codes = extractDtcCodes(sourceText || "");
  const primary = codes[0];
  if (!primary) return [...DTC_FOLLOW_UP_CHIPS];

  const local = lookupLocalDtc(primary);
  if (!local.catalogHit) return [...UNKNOWN_DTC_CHIPS];

  const guide = playbookChipForCode(primary);
  const shopLean = local.diyLevel === "shop";
  const checks: DtcChip = {
    id: "dtc-checks",
    label: shopLean ? "Shop path" : "Check order",
    prompt: shopLean
      ? `For ${primary} (${local.title}), diy_level is shop. Prefer a qualified shop. DIY is observe-only: record the code, lights, and symptoms. Do not invent a parts order, torque, or OEM number.`
      : `For ${primary} (${local.title}), give an educational check order using diy_level ${local.diyLevel}: observe → basic → advanced → shop. Do not assert a part must be replaced now. Do not invent torque or OEM part numbers.`,
  };
  const explain: DtcChip = {
    id: "dtc-explain",
    label: "Explain this code",
    prompt: `Explain ${primary} using the local catalog title and summary only. diy_level is ${local.diyLevel}. Do not invent a different OEM definition.`,
  };
  return [guide, checks, explain].filter((c): c is DtcChip => Boolean(c));
}

/** True if text looks like a DTC-focused reply / user message. */
export function textHasDtcSignal(text?: string | null): boolean {
  if (!text) return false;
  if (extractDtcCodes(text).length > 0) return true;
  return /fault code|dtc|check engine|obd|trouble code/i.test(text);
}
