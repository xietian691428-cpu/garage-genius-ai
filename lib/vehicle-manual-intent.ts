/**
 * Intent-aware query construction for private per-vehicle manuals.
 * Never used for global RAG. No VIN.
 * Fuzzy asks go through light diagnostic rewrite before classify / expand.
 */

import { extractDtcCodes } from "@/lib/dtc-parse";
import {
  intentHintFromRewrite,
  rewriteDiagnosticQuery,
  rerankManualHitsForIntent,
} from "@/lib/diagnostic-query-rewrite";

export const MANUAL_INTENTS = [
  "fluids_oil",
  "fluids_coolant",
  "overheat",
  "fluids_brake",
  "brake_warning",
  "fluids_atf",
  "fluids_other",
  "torque_spec",
  "scheduled_maintenance",
  "dtc_related",
  "electrical_fuse",
  "lighting",
  "general",
] as const;

export type ManualIntent = (typeof MANUAL_INTENTS)[number];

const INTENT_EXPAND: Record<ManualIntent, string> = {
  fluids_oil:
    "engine oil motor oil viscosity capacity quarts liters SAE 0W 5W with filter crankcase refill dipstick",
  fluids_coolant:
    "coolant antifreeze capacity mixture reservoir overflow radiator engine coolant level",
  overheat:
    "coolant antifreeze overheating steam radiator reservoir cold check level after cool down overflow",
  fluids_brake:
    "brake fluid DOT reservoir DOT-3 DOT-4 DOT-5.1 hydraulic brake fluid type",
  brake_warning:
    "brake fluid DOT reservoir soft pedal warning light do not drive professional inspection",
  fluids_atf:
    "ATF automatic transmission fluid CVT fluid capacity Mercon Dexron WS transmission fluid type",
  fluids_other:
    "power steering washer fluid differential gear oil",
  torque_spec: "torque specification ft-lb N·m tighten drain plug",
  scheduled_maintenance:
    "maintenance schedule interval miles km service replace inspect",
  dtc_related: "malfunction indicator diagnosis trouble code check engine",
  electrical_fuse: "fuse box diagram ampere relay location",
  lighting: "headlight bulb replacement housing lamp",
  general: "",
};

/** Weak P-code → system tokens for retrieval only (not a diagnosis). */
const DTC_FAMILY_QUERY: Array<{ re: RegExp; terms: string }> = [
  { re: /^P0420$|^P0430$/, terms: "catalyst converter oxygen sensor exhaust" },
  { re: /^P0171$|^P0174$/, terms: "system too lean oxygen sensor fuel trim" },
  { re: /^P030[0-8]$/, terms: "misfire spark plug ignition coil" },
  { re: /^P044[0-9]$|^P045[0-7]$/, terms: "evap canister purge valve" },
  { re: /^P0128$/, terms: "coolant thermostat temperature" },
  { re: /^P040[0-6]$/, terms: "EGR exhaust gas recirculation" },
  { re: /^P050[67]$/, terms: "idle control" },
  { re: /^P013[0-9]$|^P015[0-9]$|^P219[5-8]$/, terms: "oxygen sensor air fuel" },
  { re: /^P0520$|^P052[1-3]$/, terms: "oil pressure sensor" },
  { re: /^U0100$|^U0101$/, terms: "lost communication module network" },
  { re: /^C0035$|^C0040$/, terms: "wheel speed sensor ABS" },
  { re: /^B00/, terms: "airbag SRS occupant" },
];

const OIL_RE =
  /\b(oil change|engine oil|motor oil|how much oil|oil (?:type|grade|capaci)|viscosit|0w-?\d+|5w-?\d+|quart|qts?\b|dipstick|drain plug|oil filter)\b/i;
const OVERHEAT_RE =
  /\b(overheat(?:ing)?|steam(?:ing)?|temp(?:erature)?\s+(?:gauge|light)|gauge\s+(?:in\s+)?red|running hot|boiling coolant|hot (?:engine|radiator))\b/i;
const COOLANT_RE =
  /\b(coolant|antifreeze|radiator (?:cap|flush)|overflow (?:tank|reservoir)|coolant (?:capacity|mixture|level|type|spec))\b/i;
const BRAKE_WARNING_RE =
  /\b((?:soft|spongy)\s+(?:brake\s+)?pedal|pedal\s+(?:feels?\s+)?(?:soft|spongy)|pedal\s+sinks|brake\s+(?:warning\s+)?light\s+(?:is\s+)?on)\b/i;
const BRAKE_FLUID_RE =
  /\b(brake fluid|DOT[\s-]?[345](?:\.1)?|brake reservoir)\b/i;
const ATF_RE =
  /\b(atf\b|automatic transmission fluid|transmission fluid|cvt fluid|cvt[\s-]?fluid|mercon|dexron|transmission fluid type)\b/i;
const OTHER_FLUID_RE =
  /\b(power steering|washer fluid|differential|gear oil)\b/i;
const TORQUE_RE = /\b(torque|ft-?lb|n[·.\s-]*m|foot[-\s]?pound)\b/i;
const MAINT_RE =
  /\b(maintenance schedule|service interval|when (?:do|should) i (?:change|replace)|scheduled maintenance|miles.*service)\b/i;
const FUSE_RE = /\b(fuse box|which fuse|amp fuse|relay)\b/i;
const LIGHTING_RE =
  /\b(headlight|low beam|high beam|tail ?light|brake light|bulb|housing|dust cap)\b/i;
const CLEAR_CODE_RE =
  /\b(clear (?:the )?codes?|erase (?:the )?codes?|reset (?:the )?(?:cel|mil|light)|delete (?:the )?codes?)\b/i;
const DIAG_RE =
  /\b(check engine|cel\b|mil\b|diagnos|what(?:'s| is) wrong|code)\b/i;

export function classifyManualIntent(
  text: string,
  dtcs: string[] = extractDtcCodes(text),
): ManualIntent {
  const rewrite = rewriteDiagnosticQuery(text || "");
  const hint = intentHintFromRewrite(rewrite);
  const t = rewrite.matchText || text || "";

  // Safety intents from rewrite hint win over weaker keyword order
  // (e.g. "brakes feel mushy" → brake_warning before lighting/fluids).
  if (hint === "brake_warning" || BRAKE_WARNING_RE.test(t)) {
    return "brake_warning";
  }
  if (hint === "overheat" || OVERHEAT_RE.test(t)) return "overheat";
  if (OIL_RE.test(t) || hint === "fluids_oil") return "fluids_oil";
  if (COOLANT_RE.test(t) || hint === "fluids_coolant") return "fluids_coolant";
  if (BRAKE_FLUID_RE.test(t) || hint === "fluids_brake") return "fluids_brake";
  if (ATF_RE.test(t) || hint === "fluids_atf") return "fluids_atf";
  if (OTHER_FLUID_RE.test(t)) return "fluids_other";
  if (TORQUE_RE.test(t)) return "torque_spec";
  if (MAINT_RE.test(t)) return "scheduled_maintenance";
  if (dtcs.length > 0 || DIAG_RE.test(t) || hint === "dtc_related") {
    return "dtc_related";
  }
  if (FUSE_RE.test(t)) return "electrical_fuse";
  if (LIGHTING_RE.test(t)) return "lighting";
  return hint && hint !== "general" ? hint : "general";
}

export function dtcSystemQueryTerms(codes: string[]): string {
  const extra: string[] = [];
  for (const code of codes.slice(0, 8)) {
    extra.push(code);
    for (const row of DTC_FAMILY_QUERY) {
      if (row.re.test(code)) extra.push(row.terms);
    }
  }
  return extra.join(" ");
}

export function isClearCodesQuestion(text: string): boolean {
  return CLEAR_CODE_RE.test(text || "");
}

export function wantsRepairFrame(intent: ManualIntent): boolean {
  return intent !== "general";
}

/** Keywords from the owner question, capped, no VIN-like blobs. */
export function questionKeywords(text: string): string {
  return (text || "")
    .replace(/\b[A-HJ-NPR-Z0-9]{17}\b/gi, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && w.length < 24)
    .slice(0, 18)
    .join(" ");
}

export function buildManualRetrievalQuery(opts: {
  userText: string;
  dtcs?: string[];
}): { intent: ManualIntent; query: string; dtcs: string[] } {
  const rewrite = rewriteDiagnosticQuery(opts.userText);
  const dtcs = opts.dtcs?.length
    ? opts.dtcs
    : extractDtcCodes(opts.userText);
  const intent = classifyManualIntent(opts.userText, dtcs);
  const parts = [
    questionKeywords(rewrite.matchText || opts.userText),
    INTENT_EXPAND[intent],
    dtcSystemQueryTerms(dtcs),
  ]
    .filter((s) => s.trim())
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
  return { intent, query: parts || "maintenance specifications", dtcs };
}

const HEADING_BOOST_RE =
  /\b(specifications?|capacit(?:y|ies)|maintenance|fluids?|engine oil|coolant|antifreeze|brake fluid|ATF|transmission|CVT|lubricants?|capacities)\b/i;

export function headingRetrievalBoost(heading: string | null | undefined): number {
  if (!heading) return 0;
  return HEADING_BOOST_RE.test(heading) ? 2 : 0;
}

/**
 * Re-rank manual chunks: heading boost + optional intent boost.
 * Callers that only have heading/rank keep working; pass intent when known.
 */
export function rerankManualHitsByHeading<
  T extends { heading: string | null; rank: number; content?: string },
>(hits: T[], limit = 4, intent?: ManualIntent | null): T[] {
  const headingBoosted = [...hits].map((h) => ({
    ...h,
    rank: Number(h.rank) + headingRetrievalBoost(h.heading),
  }));
  return rerankManualHitsForIntent(headingBoosted, { intent, limit });
}
