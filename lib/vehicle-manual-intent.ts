/**
 * Intent-aware query construction for private per-vehicle manuals.
 * Never used for global RAG. No VIN.
 */

import { extractDtcCodes } from "@/lib/dtc-parse";

export const MANUAL_INTENTS = [
  "fluids_oil",
  "fluids_coolant",
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
    "coolant capacity mixture antifreeze reservoir overflow radiator",
  fluids_other:
    "transmission fluid ATF brake fluid power steering washer fluid",
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
const COOLANT_RE =
  /\b(coolant|antifreeze|radiator (?:cap|flush)|overflow tank)\b/i;
const OTHER_FLUID_RE =
  /\b(transmission fluid|atf\b|brake fluid|power steering|washer fluid)\b/i;
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
  const t = text || "";
  if (OIL_RE.test(t)) return "fluids_oil";
  if (COOLANT_RE.test(t)) return "fluids_coolant";
  if (OTHER_FLUID_RE.test(t)) return "fluids_other";
  if (TORQUE_RE.test(t)) return "torque_spec";
  if (MAINT_RE.test(t)) return "scheduled_maintenance";
  if (dtcs.length > 0 || DIAG_RE.test(t)) return "dtc_related";
  if (FUSE_RE.test(t)) return "electrical_fuse";
  if (LIGHTING_RE.test(t)) return "lighting";
  return "general";
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
  const dtcs = opts.dtcs?.length
    ? opts.dtcs
    : extractDtcCodes(opts.userText);
  const intent = classifyManualIntent(opts.userText, dtcs);
  const parts = [
    questionKeywords(opts.userText),
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
  /\b(specifications?|capacit(?:y|ies)|maintenance|fluids?|engine oil|lubricants?|capacities)\b/i;

export function headingRetrievalBoost(heading: string | null | undefined): number {
  if (!heading) return 0;
  return HEADING_BOOST_RE.test(heading) ? 2 : 0;
}

export function rerankManualHitsByHeading<T extends { heading: string | null; rank: number }>(
  hits: T[],
  limit = 4,
): T[] {
  return [...hits]
    .map((h) => ({
      ...h,
      rank: Number(h.rank) + headingRetrievalBoost(h.heading),
    }))
    .sort((a, b) => b.rank - a.rank)
    .slice(0, Math.max(1, Math.min(limit, 5)));
}
