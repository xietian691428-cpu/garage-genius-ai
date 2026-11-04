/**
 * Heuristic oil / coolant / brake-fluid extract from private manual chunks.
 * Staging only — never silent garage writes. user_id × vehicle_id.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { BuiltChunk } from "@/lib/vehicle-manuals";

export type ExtractKind = "oil" | "coolant" | "brake_fluid";

export type OilExtractField = "viscosity" | "capacity";
export type CoolantExtractField =
  | "coolant_spec_text"
  | "coolant_capacity_text"
  | "coolant_mix";
export type BrakeFluidExtractField =
  | "brake_fluid_spec_text"
  | "brake_fluid_notes_text";
export type ExtractField =
  | OilExtractField
  | CoolantExtractField
  | BrakeFluidExtractField;
export type ExtractStatus = "pending" | "confirmed" | "rejected" | "superseded";
export type FluidsSource = "user_entered" | "vcdb" | "user_manual_confirmed";

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

export type ManualExtractGuess =
  | OilExtractGuess
  | CoolantExtractGuess
  | BrakeFluidExtractGuess;

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

/** After PDF process: supersede old staging, then stage oil + coolant + brake. */
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
  return [...oil, ...coolant, ...brake];
}

export async function clearManualConfirmedFluids(opts: {
  client: SupabaseClient;
  userId: string;
  vehicleId: string;
}): Promise<void> {
  const { data, error } = await opts.client
    .from("user_vehicles")
    .select(
      "oil_capacity_source, oil_viscosity_source, coolant_spec_source, coolant_capacity_source, coolant_mix_source, brake_fluid_spec_source, brake_fluid_notes_source",
    )
    .eq("id", opts.vehicleId)
    .eq("user_id", opts.userId)
    .maybeSingle();
  if (error) {
    if (
      /oil_capacity_source|oil_viscosity_source|coolant_|brake_fluid_/i.test(
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
  if (Object.keys(patch).length === 0) return;
  const { error: upErr } = await opts.client
    .from("user_vehicles")
    .update(patch)
    .eq("id", opts.vehicleId)
    .eq("user_id", opts.userId);
  if (
    upErr &&
    !/oil_capacity_source|oil_specs_confirmed_at|coolant_|brake_fluid_/i.test(
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
