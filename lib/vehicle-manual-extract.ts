/**
 * Heuristic oil / coolant / brake-fluid / ATF extract from private manual chunks.
 * Staging only — never silent garage writes. user_id × vehicle_id.
 * ATF candidates never write oil_* columns.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { BuiltChunk } from "@/lib/vehicle-manuals";

export type ExtractKind = "oil" | "coolant" | "brake_fluid" | "atf";

export type OilExtractField = "viscosity" | "capacity";
export type CoolantExtractField =
  | "coolant_spec_text"
  | "coolant_capacity_text"
  | "coolant_mix";
export type BrakeFluidExtractField =
  | "brake_fluid_spec_text"
  | "brake_fluid_notes_text";
export type AtfExtractField =
  | "atf_spec_text"
  | "atf_capacity_text"
  | "atf_notes_text";
export type ExtractField =
  | OilExtractField
  | CoolantExtractField
  | BrakeFluidExtractField
  | AtfExtractField;
export type ExtractStatus = "pending" | "confirmed" | "rejected" | "superseded";
export type FluidsSource = "user_entered" | "vcdb" | "user_manual_confirmed";
/** CVT vs conventional ATF on kind=atf — never a separate kind=cvt. */
export type TransmissionKind = "atf" | "cvt" | "unknown";

export type OilExtractGuess = {
  kind: "oil";
  field: OilExtractField;
  value: string;
  unit: string | null;
  excerpt: string;
  pageFrom: number | null;
  pageTo: number | null;
  score: number;
};

export type CoolantExtractGuess = {
  kind: "coolant";
  field: CoolantExtractField;
  value: string;
  unit: string | null;
  excerpt: string;
  pageFrom: number | null;
  pageTo: number | null;
  score: number;
};

export type BrakeFluidExtractGuess = {
  kind: "brake_fluid";
  field: BrakeFluidExtractField;
  value: string;
  unit: string | null;
  excerpt: string;
  pageFrom: number | null;
  pageTo: number | null;
  score: number;
};

export type AtfExtractGuess = {
  kind: "atf";
  field: AtfExtractField;
  value: string;
  unit: string | null;
  excerpt: string;
  pageFrom: number | null;
  pageTo: number | null;
  score: number;
  transmissionKind: TransmissionKind;
};

export type ManualExtractGuess =
  | OilExtractGuess
  | CoolantExtractGuess
  | BrakeFluidExtractGuess
  | AtfExtractGuess;

export type ManualExtractCandidateRow = {
  id: string;
  user_id: string;
  vehicle_id: string;
  manual_id: string;
  kind: ExtractKind;
  field: ExtractField;
  value: string;
  unit: string | null;
  excerpt: string | null;
  page_from: number | null;
  page_to: number | null;
  status: ExtractStatus;
  transmission_kind?: TransmissionKind | null;
  created_at: string;
  resolved_at: string | null;
};

export type ManualExtractClientDto = {
  id: string;
  kind: ExtractKind;
  field: ExtractField;
  value: string;
  unit: string | null;
  excerpt: string | null;
  pageFrom: number | null;
  pageTo: number | null;
  status: ExtractStatus;
  transmissionKind?: TransmissionKind | null;
};

const OIL_CONTEXT_RE =
  /\b(engine oil|motor oil|crankcase|oil capacity|with filter|sae|viscosit|oil grade|oil type|refill)\b/i;
const NON_OIL_RE =
  /\b(coolant|antifreeze|brake fluid|transmission|atf\b|washer|power steering|fuel tank|def\b|windshield)\b/i;
const VISC_RE = /\b(\d{1,2})\s*W\s*-?\s*(\d{2})\b/gi;
const CAP_RE =
  /\b(\d+(?:\.\d+)?)\s*(?:US\s+|Imp\.?\s+)?(qts?|quarts?|liters?|litres)\b/gi;

const COOLANT_CONTEXT_RE =
  /\b(engine coolant|coolant|antifreeze|cooling system|radiator coolant|coolant mixture|coolant capacity|coolant reservoir|overflow (?:tank|reservoir))\b/i;
const NON_COOLANT_RE =
  /\b(windshield|washer fluid|washer\b|brake fluid|atf\b|transmission fluid|power steering|refrigerant|a\/c\b|air[\s-]?condition|battery|engine oil|motor oil|crankcase)\b/i;
const COOLANT_SPEC_RE =
  /\b((?:ethylene|propylene)\s+glycol|super long[\s-]?life(?:\s+coolant)?|long[\s-]?life coolant|toyota\s+super\s+long\s+life|SLC\b|LLC\b|HOAT|OAT\b|IAT\b|phosphate[\s-]?free|silicate[\s-]?free|DEX-?COOL|G-?\d{2}|pre[\s-]?diluted coolant)\b/gi;
const COOLANT_MIX_RE =
  /\b((?:50\s*[/:]\s*50)|(?:pre[\s-]?mixed)|(?:premixed)|(?:pre[\s-]?diluted))\b/gi;

const BRAKE_CONTEXT_RE =
  /\b(brake fluid|brake[\s-]?fluid|brake reservoir|DOT[\s-]?[345](?:\.1)?)\b/i;
const NON_BRAKE_RE =
  /\b(coolant|antifreeze|engine oil|motor oil|atf\b|transmission fluid|washer fluid|washer\b|refrigerant|a\/c\b|air[\s-]?condition|power steering)\b/i;
const CLUTCH_ALONE_RE = /\bclutch(?:\s+fluid)?\b/i;
const SHARED_BRAKE_CLUTCH_RE =
  /\b(?:shared|common)\s+(?:brake\s+)?(?:and\s+)?clutch|\bclutch\s+(?:and|&)\s+brake.{0,48}(?:shared|common)|(?:shared|common).{0,48}brake.{0,24}clutch\b/i;
const BRAKE_DOT_RE = /\b(DOT[\s-]?[345](?:\.1)?)\b/gi;
const BRAKE_NOTES_RE =
  /\b((?:every|each)\s+\d+\s*(?:months?|years?|miles?|km)|replace(?:ment)?\s+interval|inspect(?:ion)?\s+(?:interval|every)|check\s+(?:the\s+)?(?:brake\s+)?fluid\s+level)\b/gi;

const ATF_CONTEXT_RE =
  /\b(atf\b|automatic transmission fluid|transmission fluid|cvt fluid|cvt[\s-]?fluid|automatic trans(?:mission)? fluid|continuously variable)\b/i;
const NON_ATF_RE =
  /\b(engine oil|motor oil|crankcase|sae\s*\d|0w-?\d+|5w-?\d+|coolant|antifreeze|brake fluid|washer fluid|washer\b|differential|rear axle|gear oil|power steering|refrigerant)\b/i;
/** Spec phrases kept as written — CVT names stay CVT, never remapped to Dexron/Mercon. */
const ATF_SPEC_RE =
  /\b((?:Toyota\s+)?ATF\s*WS|ATF[\s-]?WS|World Standard|Mercon(?:\s*[LV]+)?|Dexron(?:[\s-]?[III|VI0-9]+)?|CVT[\s-]?fluid(?:\s+FE)?|Genuine\s+CVT(?:\s+fluid)?|CVT[\s-]?FE|CVTF|NS[\s-]?[0-9]|HCF-?2|JWS\s*\d+|T-?IV|ATF[\s-]?Type[\s-]?[A-Z0-9]+|Genuine\s+ATF)\b/gi;
const ATF_NOTES_RE =
  /\b((?:check|inspect)\s+(?:the\s+)?(?:ATF|CVT|transmission)\s+(?:fluid\s+)?level|dipstick|fill\s+plug|drain[\s-]and[\s-]fill)\b/gi;

const CVT_SIGNAL_RE =
  /\b(CVT\b|continuously variable|CVT[\s-]?fluid|CVT[\s-]?FE\b|CVTF\b|Genuine\s+CVT|NS-?[23]\b|HCF-?2)\b/i;
const CONVENTIONAL_ATF_SIGNAL_RE =
  /\b(Mercon|Dexron|(?:Toyota\s+)?ATF\s*WS|ATF[\s-]?WS|World Standard|T-?IV|automatic transmission fluid|ATF)\b/i;

function isOilContext(text: string): boolean {
  const t = text || "";
  if (OIL_CONTEXT_RE.test(t)) return true;
  if (NON_OIL_RE.test(t) && !OIL_CONTEXT_RE.test(t)) return false;
  return false;
}

function isCoolantContext(text: string): boolean {
  const t = text || "";
  if (!COOLANT_CONTEXT_RE.test(t)) return false;
  if (NON_COOLANT_RE.test(t) && !COOLANT_CONTEXT_RE.test(t)) return false;
  return true;
}

function isBrakeFluidContext(text: string): boolean {
  const t = text || "";
  if (!BRAKE_CONTEXT_RE.test(t)) return false;
  // Clutch-only pages: skip unless the manual says shared/common reservoir with brakes.
  if (CLUTCH_ALONE_RE.test(t) && !SHARED_BRAKE_CLUTCH_RE.test(t)) {
    if (!/\bbrake fluid\b/i.test(t) && !/\bbrake reservoir\b/i.test(t)) {
      return false;
    }
  }
  return true;
}

function normalizeDotSpec(raw: string): string {
  const m = raw.match(/DOT[\s-]?([345](?:\.1)?)/i);
  if (!m) return raw.replace(/\s+/g, " ").trim().slice(0, 40);
  return `DOT-${m[1]}`;
}

function isAtfContext(text: string): boolean {
  const t = text || "";
  if (!ATF_CONTEXT_RE.test(t)) return false;
  if (NON_ATF_RE.test(t) && !ATF_CONTEXT_RE.test(t)) return false;
  return true;
}

/**
 * Bucket CVT vs conventional ATF vs unknown. Prefer unknown on conflict.
 * Spec text is always kept verbatim elsewhere — this only labels the class.
 */
export function classifyTransmissionKind(text: string): TransmissionKind {
  const t = text || "";
  const hasCvt = CVT_SIGNAL_RE.test(t);
  const hasConventional = CONVENTIONAL_ATF_SIGNAL_RE.test(t);
  if (hasCvt && hasConventional) {
    // Manual forbids substituting ATF into a CVT → still CVT.
    if (
      /\b(do not|don't|never|not)\b[\s\S]{0,48}\b(ATF|Dexron|Mercon|regular ATF)\b/i.test(
        t,
      ) ||
      /\b(ATF|Dexron|Mercon|regular ATF)\b[\s\S]{0,48}\b(do not|don't|never|not)\b/i.test(
        t,
      )
    ) {
      return "cvt";
    }
    // Both Mercon/Dexron and CVT named as specs → unclear.
    if (/\b(Mercon|Dexron)\b/i.test(t)) return "unknown";
    return "unknown";
  }
  if (hasCvt) return "cvt";
  if (hasConventional) return "atf";
  if (/\btransmission fluid\b/i.test(t)) return "unknown";
  return "unknown";
}

export function mergeTransmissionKinds(
  kinds: Array<TransmissionKind | null | undefined>,
): TransmissionKind {
  const set = new Set(
    kinds.filter((k): k is TransmissionKind => k === "atf" || k === "cvt" || k === "unknown"),
  );
  if (set.has("cvt") && set.has("atf")) return "unknown";
  if (set.has("cvt")) return "cvt";
  if (set.has("atf")) return "atf";
  return "unknown";
}

export function normalizeTransmissionKind(
  raw: string | null | undefined,
): TransmissionKind | null {
  if (raw === "atf" || raw === "cvt" || raw === "unknown") return raw;
  return null;
}

export function normalizeExtractKind(
  kind: string | null | undefined,
  field?: string | null,
): ExtractKind {
  if (kind === "coolant" || String(field || "").startsWith("coolant_")) {
    return "coolant";
  }
  if (
    kind === "brake_fluid" ||
    String(field || "").startsWith("brake_fluid_")
  ) {
    return "brake_fluid";
  }
  if (kind === "atf" || String(field || "").startsWith("atf_")) {
    return "atf";
  }
  return "oil";
}

function excerptAround(text: string, index: number, len = 160): string {
  const start = Math.max(0, index - 40);
  return text.slice(start, start + len).replace(/\s+/g, " ").trim();
}

function normalizeViscosity(w: string, n: string): string {
  return `${Number(w)}W-${Number(n)}`;
}

function normalizeCapacity(num: string, unit: string): { value: string; unit: string } {
  const n = Number.parseFloat(num);
  const u = unit.toLowerCase();
  const kind = /^(qts?|quarts?)$/.test(u) ? "qt" : "L";
  return { value: `${n} ${kind === "qt" ? "qt" : "L"}`, unit: kind };
}

/** Keep capacity as written for coolant — no forced conversion. */
function coolantCapacityAsWritten(num: string, unit: string): { value: string; unit: string } {
  const n = Number.parseFloat(num);
  const u = unit.toLowerCase();
  if (/^(qts?|quarts?)$/.test(u)) {
    return { value: `${n} qt`, unit: "qt" };
  }
  return { value: `${n} L`, unit: "L" };
}

function normalizeCoolantMix(raw: string): string {
  const t = raw.replace(/\s+/g, " ").trim();
  if (/50\s*[/:]\s*50/i.test(t)) return "50/50";
  if (/pre[\s-]?mix|pre[\s-]?dilut/i.test(t)) return "pre-mixed";
  return t.slice(0, 40);
}

export function extractOilGuessesFromText(
  text: string,
  pages?: { pageFrom?: number | null; pageTo?: number | null; heading?: string | null },
): OilExtractGuess[] {
  if (!text) return [];
  const heading = pages?.heading || "";
  const blob = `${heading}\n${text}`;
  if (!isOilContext(blob)) return [];

  const out: OilExtractGuess[] = [];
  const headingBoost = OIL_CONTEXT_RE.test(pages?.heading || "") ? 2 : 0;

  for (const m of blob.matchAll(new RegExp(VISC_RE.source, "gi"))) {
    const value = normalizeViscosity(m[1], m[2]);
    out.push({
      kind: "oil",
      field: "viscosity",
      value,
      unit: null,
      excerpt: excerptAround(blob, m.index ?? 0),
      pageFrom: pages?.pageFrom ?? null,
      pageTo: pages?.pageTo ?? null,
      score: 3 + headingBoost,
    });
  }

  for (const m of blob.matchAll(new RegExp(CAP_RE.source, "gi"))) {
    const left = blob.slice(Math.max(0, (m.index ?? 0) - 48), m.index ?? 0);
    const right = blob.slice(
      m.index ?? 0,
      (m.index ?? 0) + m[0].length + 36,
    );
    const window = `${left}${right}`;
    const nonOilLeft =
      /\b(coolant|antifreeze|brake fluid|transmission|atf\b|washer|power steering|fuel tank|def\b|gearbox)\b/i.test(
        left,
      );
    if (nonOilLeft) continue;
    const nearEngine =
      /\b(engine oil|motor oil|crankcase|with filter)\b/i.test(window) ||
      /\boil capacity\b/i.test(left);
    if (NON_OIL_RE.test(window) && !nearEngine) continue;
    const { value, unit } = normalizeCapacity(m[1], m[2]);
    const withFilter = /with filter/i.test(window);
    out.push({
      kind: "oil",
      field: "capacity",
      value: withFilter ? `${value} with filter` : value,
      unit,
      excerpt: excerptAround(blob, m.index ?? 0),
      pageFrom: pages?.pageFrom ?? null,
      pageTo: pages?.pageTo ?? null,
      score: (withFilter ? 4 : 3) + headingBoost,
    });
  }

  return out;
}

export function extractCoolantGuessesFromText(
  text: string,
  pages?: { pageFrom?: number | null; pageTo?: number | null; heading?: string | null },
): CoolantExtractGuess[] {
  if (!text) return [];
  const heading = pages?.heading || "";
  const blob = `${heading}\n${text}`;
  if (!isCoolantContext(blob)) return [];

  const out: CoolantExtractGuess[] = [];
  const headingBoost = COOLANT_CONTEXT_RE.test(pages?.heading || "") ? 2 : 0;

  for (const m of blob.matchAll(new RegExp(COOLANT_SPEC_RE.source, "gi"))) {
    const left = blob.slice(Math.max(0, (m.index ?? 0) - 40), m.index ?? 0);
    const right = blob.slice(
      m.index ?? 0,
      (m.index ?? 0) + m[0].length + 48,
    );
    const window = `${left}${right}`;
    if (NON_COOLANT_RE.test(window) && !COOLANT_CONTEXT_RE.test(window)) continue;
    const value = m[0].replace(/\s+/g, " ").trim().slice(0, 80);
    out.push({
      kind: "coolant",
      field: "coolant_spec_text",
      value,
      unit: null,
      excerpt: excerptAround(blob, m.index ?? 0),
      pageFrom: pages?.pageFrom ?? null,
      pageTo: pages?.pageTo ?? null,
      score: 3 + headingBoost,
    });
  }

  for (const m of blob.matchAll(new RegExp(CAP_RE.source, "gi"))) {
    const left = blob.slice(Math.max(0, (m.index ?? 0) - 56), m.index ?? 0);
    const right = blob.slice(
      m.index ?? 0,
      (m.index ?? 0) + m[0].length + 40,
    );
    const window = `${left}${right}`;
    if (NON_COOLANT_RE.test(window)) continue;
    const nearCoolant =
      /\b(coolant|antifreeze|cooling system)\b/i.test(window) ||
      /\bcoolant capacity\b/i.test(left) ||
      COOLANT_CONTEXT_RE.test(heading);
    if (!nearCoolant) continue;
    // Engine-oil left context must not count as coolant capacity.
    if (/\b(engine oil|motor oil|crankcase|with filter|oil capacity)\b/i.test(left)) {
      continue;
    }
    const { value, unit } = coolantCapacityAsWritten(m[1], m[2]);
    out.push({
      kind: "coolant",
      field: "coolant_capacity_text",
      value,
      unit,
      excerpt: excerptAround(blob, m.index ?? 0),
      pageFrom: pages?.pageFrom ?? null,
      pageTo: pages?.pageTo ?? null,
      score: 4 + headingBoost,
    });
  }

  for (const m of blob.matchAll(new RegExp(COOLANT_MIX_RE.source, "gi"))) {
    const left = blob.slice(Math.max(0, (m.index ?? 0) - 48), m.index ?? 0);
    const right = blob.slice(
      m.index ?? 0,
      (m.index ?? 0) + m[0].length + 36,
    );
    const window = `${left}${right}`;
    if (NON_COOLANT_RE.test(window)) continue;
    if (!/\b(coolant|antifreeze|mixture|mix)\b/i.test(window)) continue;
    out.push({
      kind: "coolant",
      field: "coolant_mix",
      value: normalizeCoolantMix(m[0]),
      unit: null,
      excerpt: excerptAround(blob, m.index ?? 0),
      pageFrom: pages?.pageFrom ?? null,
      pageTo: pages?.pageTo ?? null,
      score: 3 + headingBoost,
    });
  }

  return out;
}

export function extractBrakeFluidGuessesFromText(
  text: string,
  pages?: { pageFrom?: number | null; pageTo?: number | null; heading?: string | null },
): BrakeFluidExtractGuess[] {
  if (!text) return [];
  const heading = pages?.heading || "";
  const blob = `${heading}\n${text}`;
  if (!isBrakeFluidContext(blob)) return [];

  const out: BrakeFluidExtractGuess[] = [];
  const headingBoost = BRAKE_CONTEXT_RE.test(pages?.heading || "") ? 2 : 0;

  for (const m of blob.matchAll(new RegExp(BRAKE_DOT_RE.source, "gi"))) {
    const left = blob.slice(Math.max(0, (m.index ?? 0) - 48), m.index ?? 0);
    const right = blob.slice(
      m.index ?? 0,
      (m.index ?? 0) + m[0].length + 40,
    );
    const window = `${left}${right}`;
    if (NON_BRAKE_RE.test(window)) continue;
    if (
      CLUTCH_ALONE_RE.test(window) &&
      !SHARED_BRAKE_CLUTCH_RE.test(window) &&
      !/\bbrake fluid\b/i.test(window)
    ) {
      continue;
    }
    const nearBrake =
      /\bbrake fluid\b/i.test(window) ||
      /\bbrake reservoir\b/i.test(window) ||
      BRAKE_CONTEXT_RE.test(heading);
    if (!nearBrake && !/\bDOT\b/i.test(m[0])) continue;
    // Prefer DOT lines that mention brake fluid / reservoir / hydraulic brake.
    if (
      !/\b(brake fluid|brake reservoir|hydraulic brake|use\s+DOT)\b/i.test(
        window,
      ) &&
      !BRAKE_CONTEXT_RE.test(heading)
    ) {
      continue;
    }
    out.push({
      kind: "brake_fluid",
      field: "brake_fluid_spec_text",
      value: normalizeDotSpec(m[0]),
      unit: null,
      excerpt: excerptAround(blob, m.index ?? 0),
      pageFrom: pages?.pageFrom ?? null,
      pageTo: pages?.pageTo ?? null,
      score: 4 + headingBoost,
    });
  }

  for (const m of blob.matchAll(new RegExp(BRAKE_NOTES_RE.source, "gi"))) {
    const left = blob.slice(Math.max(0, (m.index ?? 0) - 56), m.index ?? 0);
    const right = blob.slice(
      m.index ?? 0,
      (m.index ?? 0) + m[0].length + 48,
    );
    const window = `${left}${right}`;
    if (NON_BRAKE_RE.test(window)) continue;
    if (!/\b(brake fluid|brake reservoir|DOT)\b/i.test(window)) continue;
    const value = excerptAround(blob, m.index ?? 0, 120).slice(0, 80);
    out.push({
      kind: "brake_fluid",
      field: "brake_fluid_notes_text",
      value,
      unit: null,
      excerpt: excerptAround(blob, m.index ?? 0),
      pageFrom: pages?.pageFrom ?? null,
      pageTo: pages?.pageTo ?? null,
      score: 2 + headingBoost,
    });
  }

  return out;
}

export function extractAtfGuessesFromText(
  text: string,
  pages?: { pageFrom?: number | null; pageTo?: number | null; heading?: string | null },
): AtfExtractGuess[] {
  if (!text) return [];
  const heading = pages?.heading || "";
  const blob = `${heading}\n${text}`;
  if (!isAtfContext(blob)) return [];

  const out: AtfExtractGuess[] = [];
  const headingBoost = ATF_CONTEXT_RE.test(pages?.heading || "") ? 2 : 0;
  const transmissionKind = classifyTransmissionKind(blob);

  for (const m of blob.matchAll(new RegExp(ATF_SPEC_RE.source, "gi"))) {
    const left = blob.slice(Math.max(0, (m.index ?? 0) - 48), m.index ?? 0);
    const right = blob.slice(
      m.index ?? 0,
      (m.index ?? 0) + m[0].length + 48,
    );
    const window = `${left}${right}`;
    if (/\b(engine oil|motor oil|coolant|brake fluid|differential|washer)\b/i.test(window)) {
      continue;
    }
    const nearAtf =
      ATF_CONTEXT_RE.test(window) ||
      ATF_CONTEXT_RE.test(heading) ||
      /\b(use|recommended|specified|type)\b/i.test(left);
    if (!nearAtf) continue;
    // Prefer local window class when a single match is clearly CVT- or ATF-only.
    const localKind = classifyTransmissionKind(window);
    const value = m[0].replace(/\s+/g, " ").trim().slice(0, 80);
    out.push({
      kind: "atf",
      field: "atf_spec_text",
      value,
      unit: null,
      excerpt: excerptAround(blob, m.index ?? 0),
      pageFrom: pages?.pageFrom ?? null,
      pageTo: pages?.pageTo ?? null,
      score: 4 + headingBoost,
      transmissionKind:
        localKind !== "unknown" ? localKind : transmissionKind,
    });
  }

  // Also keep a short ATF/CVT fluid label when named without a brand token.
  // Prefer CVT fluid wording so UI never titles CVT as generic ATF alone.
  if (
    !out.some((g) => g.field === "atf_spec_text") &&
    /\b(CVT fluid|automatic transmission fluid|ATF)\b/i.test(blob)
  ) {
    const m =
      blob.match(/\bCVT fluid\b/i) ||
      blob.match(/\b(automatic transmission fluid|ATF)\b/i);
    if (m && m.index != null) {
      out.push({
        kind: "atf",
        field: "atf_spec_text",
        value: m[0].replace(/\s+/g, " ").trim().slice(0, 80),
        unit: null,
        excerpt: excerptAround(blob, m.index),
        pageFrom: pages?.pageFrom ?? null,
        pageTo: pages?.pageTo ?? null,
        score: 2 + headingBoost,
        transmissionKind: classifyTransmissionKind(
          `${m[0]} ${excerptAround(blob, m.index, 80)}`,
        ),
      });
    }
  }

  for (const m of blob.matchAll(new RegExp(CAP_RE.source, "gi"))) {
    const left = blob.slice(Math.max(0, (m.index ?? 0) - 56), m.index ?? 0);
    const right = blob.slice(
      m.index ?? 0,
      (m.index ?? 0) + m[0].length + 40,
    );
    const window = `${left}${right}`;
    if (NON_ATF_RE.test(window) && !ATF_CONTEXT_RE.test(window)) continue;
    if (/\b(engine oil|motor oil|with filter|oil capacity|coolant|brake fluid)\b/i.test(left)) {
      continue;
    }
    const nearAtf =
      /\b(ATF|transmission fluid|CVT|automatic transmission)\b/i.test(window) ||
      ATF_CONTEXT_RE.test(heading);
    if (!nearAtf) continue;
    const { value, unit } = coolantCapacityAsWritten(m[1], m[2]);
    out.push({
      kind: "atf",
      field: "atf_capacity_text",
      value,
      unit,
      excerpt: excerptAround(blob, m.index ?? 0),
      pageFrom: pages?.pageFrom ?? null,
      pageTo: pages?.pageTo ?? null,
      score: 4 + headingBoost,
      transmissionKind:
        classifyTransmissionKind(window) !== "unknown"
          ? classifyTransmissionKind(window)
          : transmissionKind,
    });
  }

  for (const m of blob.matchAll(new RegExp(ATF_NOTES_RE.source, "gi"))) {
    const left = blob.slice(Math.max(0, (m.index ?? 0) - 48), m.index ?? 0);
    const right = blob.slice(
      m.index ?? 0,
      (m.index ?? 0) + m[0].length + 40,
    );
    const window = `${left}${right}`;
    if (!ATF_CONTEXT_RE.test(window) && !ATF_CONTEXT_RE.test(heading)) continue;
    if (/\b(engine oil|motor oil)\b/i.test(window)) continue;
    out.push({
      kind: "atf",
      field: "atf_notes_text",
      value: excerptAround(blob, m.index ?? 0, 120).slice(0, 80),
      unit: null,
      excerpt: excerptAround(blob, m.index ?? 0),
      pageFrom: pages?.pageFrom ?? null,
      pageTo: pages?.pageTo ?? null,
      score: 2 + headingBoost,
      transmissionKind,
    });
  }

  return out;
}

export function extractOilGuessesFromChunks(
  chunks: Array<
    Pick<BuiltChunk, "content" | "heading" | "pageFrom" | "pageTo">
  >,
): OilExtractGuess[] {
  const all: OilExtractGuess[] = [];
  for (const ch of chunks) {
    all.push(
      ...extractOilGuessesFromText(ch.content, {
        heading: ch.heading,
        pageFrom: ch.pageFrom,
        pageTo: ch.pageTo,
      }),
    );
  }
  return pickBestOilGuesses(all);
}

export function extractCoolantGuessesFromChunks(
  chunks: Array<
    Pick<BuiltChunk, "content" | "heading" | "pageFrom" | "pageTo">
  >,
): CoolantExtractGuess[] {
  const all: CoolantExtractGuess[] = [];
  for (const ch of chunks) {
    all.push(
      ...extractCoolantGuessesFromText(ch.content, {
        heading: ch.heading,
        pageFrom: ch.pageFrom,
        pageTo: ch.pageTo,
      }),
    );
  }
  return pickBestCoolantGuesses(all);
}

export function extractBrakeFluidGuessesFromChunks(
  chunks: Array<
    Pick<BuiltChunk, "content" | "heading" | "pageFrom" | "pageTo">
  >,
): BrakeFluidExtractGuess[] {
  const all: BrakeFluidExtractGuess[] = [];
  for (const ch of chunks) {
    all.push(
      ...extractBrakeFluidGuessesFromText(ch.content, {
        heading: ch.heading,
        pageFrom: ch.pageFrom,
        pageTo: ch.pageTo,
      }),
    );
  }
  return pickBestBrakeFluidGuesses(all);
}

export function extractAtfGuessesFromChunks(
  chunks: Array<
    Pick<BuiltChunk, "content" | "heading" | "pageFrom" | "pageTo">
  >,
): AtfExtractGuess[] {
  const all: AtfExtractGuess[] = [];
  for (const ch of chunks) {
    all.push(
      ...extractAtfGuessesFromText(ch.content, {
        heading: ch.heading,
        pageFrom: ch.pageFrom,
        pageTo: ch.pageTo,
      }),
    );
  }
  return pickBestAtfGuesses(all);
}

/** One best guess per oil field — staging, not truth. */
export function pickBestGuesses(guesses: OilExtractGuess[]): OilExtractGuess[] {
  return pickBestOilGuesses(guesses);
}

export function pickBestOilGuesses(guesses: OilExtractGuess[]): OilExtractGuess[] {
  const best = new Map<OilExtractField, OilExtractGuess>();
  for (const g of guesses) {
    const prev = best.get(g.field);
    if (!prev || g.score > prev.score) best.set(g.field, g);
  }
  return [...best.values()];
}

export function pickBestCoolantGuesses(
  guesses: CoolantExtractGuess[],
): CoolantExtractGuess[] {
  const best = new Map<CoolantExtractField, CoolantExtractGuess>();
  for (const g of guesses) {
    const prev = best.get(g.field);
    if (!prev || g.score > prev.score) best.set(g.field, g);
  }
  return [...best.values()];
}

export function pickBestBrakeFluidGuesses(
  guesses: BrakeFluidExtractGuess[],
): BrakeFluidExtractGuess[] {
  const best = new Map<BrakeFluidExtractField, BrakeFluidExtractGuess>();
  for (const g of guesses) {
    const prev = best.get(g.field);
    if (!prev || g.score > prev.score) best.set(g.field, g);
  }
  return [...best.values()];
}

export function pickBestAtfGuesses(guesses: AtfExtractGuess[]): AtfExtractGuess[] {
  const mergedKind = mergeTransmissionKinds(
    guesses.map((g) => g.transmissionKind),
  );
  const best = new Map<AtfExtractField, AtfExtractGuess>();
  for (const g of guesses) {
    const prev = best.get(g.field);
    if (!prev || g.score > prev.score) best.set(g.field, g);
  }
  return [...best.values()].map((g) => ({
    ...g,
    transmissionKind: mergedKind,
  }));
}

export function toExtractClientDto(
  row: ManualExtractCandidateRow,
): ManualExtractClientDto {
  return {
    id: row.id,
    kind: normalizeExtractKind(row.kind, row.field),
    field: row.field,
    value: row.value,
    unit: row.unit,
    excerpt: row.excerpt,
    pageFrom: row.page_from,
    pageTo: row.page_to,
    status: row.status,
    transmissionKind: normalizeTransmissionKind(row.transmission_kind),
  };
}

export function isCoolantExtractField(field: string): field is CoolantExtractField {
  return (
    field === "coolant_spec_text" ||
    field === "coolant_capacity_text" ||
    field === "coolant_mix"
  );
}

export function isBrakeFluidExtractField(
  field: string,
): field is BrakeFluidExtractField {
  return (
    field === "brake_fluid_spec_text" || field === "brake_fluid_notes_text"
  );
}

export function isAtfExtractField(field: string): field is AtfExtractField {
  return (
    field === "atf_spec_text" ||
    field === "atf_capacity_text" ||
    field === "atf_notes_text"
  );
}

export async function listPendingExtracts(
  client: SupabaseClient,
  userId: string,
  vehicleId: string,
  kind?: ExtractKind,
): Promise<ManualExtractCandidateRow[]> {
  let q = client
    .from("vehicle_manual_extract_candidates")
    .select("*")
    .eq("user_id", userId)
    .eq("vehicle_id", vehicleId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (kind) q = q.eq("kind", kind);
  const { data, error } = await q;
  if (error) {
    if (/vehicle_manual_extract_candidates/i.test(error.message)) return [];
    throw error;
  }
  return ((data as ManualExtractCandidateRow[]) || []).map((row) => ({
    ...row,
    kind: normalizeExtractKind(row.kind, row.field),
  }));
}

export async function supersedeExtractsForVehicle(opts: {
  client: SupabaseClient;
  userId: string;
  vehicleId: string;
  manualId?: string;
  kind?: ExtractKind;
}): Promise<void> {
  let q = opts.client
    .from("vehicle_manual_extract_candidates")
    .update({
      status: "superseded",
      resolved_at: new Date().toISOString(),
    })
    .eq("user_id", opts.userId)
    .eq("vehicle_id", opts.vehicleId)
    .in("status", ["pending", "confirmed"]);
  if (opts.manualId) q = q.eq("manual_id", opts.manualId);
  if (opts.kind) q = q.eq("kind", opts.kind);
  const { error } = await q;
  if (error && !/vehicle_manual_extract_candidates/i.test(error.message)) {
    throw error;
  }
}

export async function persistOilExtractCandidates(opts: {
  client: SupabaseClient;
  userId: string;
  vehicleId: string;
  manualId: string;
  chunks: Array<Pick<BuiltChunk, "content" | "heading" | "pageFrom" | "pageTo">>;
  /** When false, caller already superseded. Default true for oil-only callers. */
  supersede?: boolean;
}): Promise<ManualExtractCandidateRow[]> {
  const guesses = extractOilGuessesFromChunks(opts.chunks);
  if (opts.supersede !== false) {
    await supersedeExtractsForVehicle({
      client: opts.client,
      userId: opts.userId,
      vehicleId: opts.vehicleId,
    });
  }
  if (!guesses.length) return [];

  const rows = guesses.map((g) => ({
    user_id: opts.userId,
    vehicle_id: opts.vehicleId,
    manual_id: opts.manualId,
    kind: "oil" as const,
    field: g.field,
    value: g.value.slice(0, 80),
    unit: g.unit,
    excerpt: g.excerpt.slice(0, 280),
    page_from: g.pageFrom,
    page_to: g.pageTo,
    status: "pending" as const,
  }));

  const { data, error } = await opts.client
    .from("vehicle_manual_extract_candidates")
    .insert(rows)
    .select("*");
  if (error) {
    if (/vehicle_manual_extract_candidates/i.test(error.message)) return [];
    throw error;
  }
  return (data as ManualExtractCandidateRow[]) || [];
}

export async function persistCoolantExtractCandidates(opts: {
  client: SupabaseClient;
  userId: string;
  vehicleId: string;
  manualId: string;
  chunks: Array<Pick<BuiltChunk, "content" | "heading" | "pageFrom" | "pageTo">>;
  supersede?: boolean;
}): Promise<ManualExtractCandidateRow[]> {
  const guesses = extractCoolantGuessesFromChunks(opts.chunks);
  if (opts.supersede !== false) {
    await supersedeExtractsForVehicle({
      client: opts.client,
      userId: opts.userId,
      vehicleId: opts.vehicleId,
      kind: "coolant",
    });
  }
  if (!guesses.length) return [];

  const rows = guesses.map((g) => ({
    user_id: opts.userId,
    vehicle_id: opts.vehicleId,
    manual_id: opts.manualId,
    kind: "coolant" as const,
    field: g.field,
    value: g.value.slice(0, 80),
    unit: g.unit,
    excerpt: g.excerpt.slice(0, 280),
    page_from: g.pageFrom,
    page_to: g.pageTo,
    status: "pending" as const,
  }));

  const { data, error } = await opts.client
    .from("vehicle_manual_extract_candidates")
    .insert(rows)
    .select("*");
  if (error) {
    // Pre-059 DBs reject kind/coolant fields — treat as no candidates.
    if (
      /vehicle_manual_extract_candidates|kind|coolant_/i.test(error.message)
    ) {
      return [];
    }
    throw error;
  }
  return (data as ManualExtractCandidateRow[]) || [];
}

export async function persistBrakeFluidExtractCandidates(opts: {
  client: SupabaseClient;
  userId: string;
  vehicleId: string;
  manualId: string;
  chunks: Array<Pick<BuiltChunk, "content" | "heading" | "pageFrom" | "pageTo">>;
  supersede?: boolean;
}): Promise<ManualExtractCandidateRow[]> {
  const guesses = extractBrakeFluidGuessesFromChunks(opts.chunks);
  if (opts.supersede !== false) {
    await supersedeExtractsForVehicle({
      client: opts.client,
      userId: opts.userId,
      vehicleId: opts.vehicleId,
      kind: "brake_fluid",
    });
  }
  if (!guesses.length) return [];

  const rows = guesses.map((g) => ({
    user_id: opts.userId,
    vehicle_id: opts.vehicleId,
    manual_id: opts.manualId,
    kind: "brake_fluid" as const,
    field: g.field,
    value: g.value.slice(0, 80),
    unit: g.unit,
    excerpt: g.excerpt.slice(0, 280),
    page_from: g.pageFrom,
    page_to: g.pageTo,
    status: "pending" as const,
  }));

  const { data, error } = await opts.client
    .from("vehicle_manual_extract_candidates")
    .insert(rows)
    .select("*");
  if (error) {
    if (
      /vehicle_manual_extract_candidates|kind|brake_fluid_/i.test(error.message)
    ) {
      return [];
    }
    throw error;
  }
  return (data as ManualExtractCandidateRow[]) || [];
}

export async function persistAtfExtractCandidates(opts: {
  client: SupabaseClient;
  userId: string;
  vehicleId: string;
  manualId: string;
  chunks: Array<Pick<BuiltChunk, "content" | "heading" | "pageFrom" | "pageTo">>;
  supersede?: boolean;
}): Promise<ManualExtractCandidateRow[]> {
  const guesses = extractAtfGuessesFromChunks(opts.chunks);
  if (opts.supersede !== false) {
    await supersedeExtractsForVehicle({
      client: opts.client,
      userId: opts.userId,
      vehicleId: opts.vehicleId,
      kind: "atf",
    });
  }
  if (!guesses.length) return [];

  const rows = guesses.map((g) => ({
    user_id: opts.userId,
    vehicle_id: opts.vehicleId,
    manual_id: opts.manualId,
    kind: "atf" as const,
    field: g.field,
    value: g.value.slice(0, 80),
    unit: g.unit,
    excerpt: g.excerpt.slice(0, 280),
    page_from: g.pageFrom,
    page_to: g.pageTo,
    status: "pending" as const,
    transmission_kind: g.transmissionKind,
  }));

  const { data, error } = await opts.client
    .from("vehicle_manual_extract_candidates")
    .insert(rows)
    .select("*");
  if (error) {
    if (
      /vehicle_manual_extract_candidates|kind|atf_|transmission_kind/i.test(
        error.message,
      )
    ) {
      return [];
    }
    throw error;
  }
  return ((data as ManualExtractCandidateRow[]) || []).map((row) => ({
    ...row,
    kind: "atf" as const,
    transmission_kind: normalizeTransmissionKind(row.transmission_kind),
  }));
}

/** After PDF process: supersede old staging, then stage oil + coolant + brake + atf. */
export async function persistManualExtractCandidates(opts: {
  client: SupabaseClient;
  userId: string;
  vehicleId: string;
  manualId: string;
  chunks: Array<Pick<BuiltChunk, "content" | "heading" | "pageFrom" | "pageTo">>;
}): Promise<ManualExtractCandidateRow[]> {
  await supersedeExtractsForVehicle({
    client: opts.client,
    userId: opts.userId,
    vehicleId: opts.vehicleId,
  });
  const oil = await persistOilExtractCandidates({
    ...opts,
    supersede: false,
  });
  const coolant = await persistCoolantExtractCandidates({
    ...opts,
    supersede: false,
  });
  const brake = await persistBrakeFluidExtractCandidates({
    ...opts,
    supersede: false,
  });
  const atf = await persistAtfExtractCandidates({
    ...opts,
    supersede: false,
  });
  return [...oil, ...coolant, ...brake, ...atf];
}

export async function clearManualConfirmedFluids(opts: {
  client: SupabaseClient;
  userId: string;
  vehicleId: string;
}): Promise<void> {
  const { data, error } = await opts.client
    .from("user_vehicles")
    .select(
      "oil_capacity_source, oil_viscosity_source, coolant_spec_source, coolant_capacity_source, coolant_mix_source, brake_fluid_spec_source, brake_fluid_notes_source, atf_spec_source, atf_capacity_source, atf_notes_source, transmission_kind",
    )
    .eq("id", opts.vehicleId)
    .eq("user_id", opts.userId)
    .maybeSingle();
  if (error) {
    if (
      /oil_capacity_source|oil_viscosity_source|coolant_|brake_fluid_|atf_|transmission_kind/i.test(
        error.message,
      )
    ) {
      return;
    }
    throw error;
  }
  if (!data) return;
  const patch: Record<string, unknown> = {};
  if (data.oil_capacity_source === "user_manual_confirmed") {
    patch.oil_capacity = null;
    patch.oil_capacity_source = null;
  }
  if (data.oil_viscosity_source === "user_manual_confirmed") {
    patch.oil_viscosity = null;
    patch.oil_viscosity_source = null;
  }
  if (Object.keys(patch).some((k) => k.startsWith("oil_"))) {
    patch.oil_specs_confirmed_at = null;
  }
  if (data.coolant_spec_source === "user_manual_confirmed") {
    patch.coolant_spec_text = null;
    patch.coolant_spec_source = null;
  }
  if (data.coolant_capacity_source === "user_manual_confirmed") {
    patch.coolant_capacity_text = null;
    patch.coolant_capacity_source = null;
  }
  if (data.coolant_mix_source === "user_manual_confirmed") {
    patch.coolant_mix_text = null;
    patch.coolant_mix_source = null;
  }
  if (
    Object.keys(patch).some(
      (k) => k.startsWith("coolant_") && k !== "coolant_specs_confirmed_at",
    )
  ) {
    patch.coolant_specs_confirmed_at = null;
  }
  if (data.brake_fluid_spec_source === "user_manual_confirmed") {
    patch.brake_fluid_spec_text = null;
    patch.brake_fluid_spec_source = null;
  }
  if (data.brake_fluid_notes_source === "user_manual_confirmed") {
    patch.brake_fluid_notes_text = null;
    patch.brake_fluid_notes_source = null;
  }
  if (
    Object.keys(patch).some(
      (k) =>
        k.startsWith("brake_fluid_") && k !== "brake_fluid_specs_confirmed_at",
    )
  ) {
    patch.brake_fluid_specs_confirmed_at = null;
  }
  if (data.atf_spec_source === "user_manual_confirmed") {
    patch.atf_spec_text = null;
    patch.atf_spec_source = null;
  }
  if (data.atf_capacity_source === "user_manual_confirmed") {
    patch.atf_capacity_text = null;
    patch.atf_capacity_source = null;
  }
  if (data.atf_notes_source === "user_manual_confirmed") {
    patch.atf_notes_text = null;
    patch.atf_notes_source = null;
  }
  if (
    Object.keys(patch).some(
      (k) => k.startsWith("atf_") && k !== "atf_specs_confirmed_at",
    )
  ) {
    patch.atf_specs_confirmed_at = null;
    patch.transmission_kind = null;
  }
  if (Object.keys(patch).length === 0) return;
  const { error: upErr } = await opts.client
    .from("user_vehicles")
    .update(patch)
    .eq("id", opts.vehicleId)
    .eq("user_id", opts.userId);
  if (
    upErr &&
    !/oil_capacity_source|oil_specs_confirmed_at|coolant_|brake_fluid_|atf_|transmission_kind/i.test(
      upErr.message,
    )
  ) {
    throw upErr;
  }
}

export function isManualConfirmedSource(
  source: string | null | undefined,
): boolean {
  return source === "user_manual_confirmed";
}

export function garagePatchForExtractConfirm(opts: {
  field: ExtractField;
  kind: ExtractKind;
  value: string;
  source: FluidsSource;
  now: string;
  transmissionKind?: TransmissionKind | null;
}): Record<string, unknown> {
  const { field, kind, value, source, now } = opts;
  if (kind === "coolant" || isCoolantExtractField(field)) {
    const patch: Record<string, unknown> = {
      coolant_specs_confirmed_at: now,
    };
    if (field === "coolant_capacity_text") {
      patch.coolant_capacity_text = value;
      patch.coolant_capacity_source = source;
    } else if (field === "coolant_mix") {
      patch.coolant_mix_text = value;
      patch.coolant_mix_source = source;
    } else {
      patch.coolant_spec_text = value;
      patch.coolant_spec_source = source;
    }
    return patch;
  }
  if (kind === "brake_fluid" || isBrakeFluidExtractField(field)) {
    const patch: Record<string, unknown> = {
      brake_fluid_specs_confirmed_at: now,
    };
    if (field === "brake_fluid_notes_text") {
      patch.brake_fluid_notes_text = value;
      patch.brake_fluid_notes_source = source;
    } else {
      patch.brake_fluid_spec_text = value;
      patch.brake_fluid_spec_source = source;
    }
    return patch;
  }
  if (kind === "atf" || isAtfExtractField(field)) {
    // Physical isolation: never write oil_* from ATF/CVT confirms.
    const patch: Record<string, unknown> = {
      atf_specs_confirmed_at: now,
    };
    const tk = normalizeTransmissionKind(opts.transmissionKind);
    if (tk) patch.transmission_kind = tk;
    else if (field === "atf_spec_text") {
      patch.transmission_kind = classifyTransmissionKind(value);
    }
    if (field === "atf_capacity_text") {
      patch.atf_capacity_text = value;
      patch.atf_capacity_source = source;
    } else if (field === "atf_notes_text") {
      patch.atf_notes_text = value;
      patch.atf_notes_source = source;
    } else {
      patch.atf_spec_text = value;
      patch.atf_spec_source = source;
    }
    return patch;
  }
  const patch: Record<string, unknown> = {
    oil_specs_confirmed_at: now,
  };
  if (field === "capacity") {
    patch.oil_capacity = value;
    patch.oil_capacity_source = source;
  } else {
    patch.oil_viscosity = value;
    patch.oil_viscosity_source = source;
  }
  return patch;
}
