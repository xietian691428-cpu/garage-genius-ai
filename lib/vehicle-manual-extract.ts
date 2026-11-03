/**
 * Heuristic oil viscosity / capacity extract from private manual chunks.
 * Staging only — never silent garage writes. user_id × vehicle_id.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { BuiltChunk } from "@/lib/vehicle-manuals";

export type ExtractField = "viscosity" | "capacity";
export type ExtractStatus = "pending" | "confirmed" | "rejected" | "superseded";
export type FluidsSource = "user_entered" | "vcdb" | "user_manual_confirmed";

export type OilExtractGuess = {
  field: ExtractField;
  value: string;
  unit: string | null;
  excerpt: string;
  pageFrom: number | null;
  pageTo: number | null;
  score: number;
};

export type ManualExtractCandidateRow = {
  id: string;
  user_id: string;
  vehicle_id: string;
  manual_id: string;
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

function isOilContext(text: string): boolean {
  const t = text || "";
  if (OIL_CONTEXT_RE.test(t)) return true;
  if (NON_OIL_RE.test(t) && !OIL_CONTEXT_RE.test(t)) return false;
  return false;
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
    // Tight left-context window — avoid "No engine oil…" on a later line
    // legitimizing coolant / ATF capacities above it.
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
  return pickBestGuesses(all);
}

/** One best guess per field — staging, not truth. */
export function pickBestGuesses(guesses: OilExtractGuess[]): OilExtractGuess[] {
  const best = new Map<ExtractField, OilExtractGuess>();
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
    field: row.field,
    value: row.value,
    unit: row.unit,
    excerpt: row.excerpt,
    pageFrom: row.page_from,
    pageTo: row.page_to,
    status: row.status,
  };
}

export async function listPendingExtracts(
  client: SupabaseClient,
  userId: string,
  vehicleId: string,
): Promise<ManualExtractCandidateRow[]> {
  const { data, error } = await client
    .from("vehicle_manual_extract_candidates")
    .select("*")
    .eq("user_id", userId)
    .eq("vehicle_id", vehicleId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) {
    if (/vehicle_manual_extract_candidates/i.test(error.message)) return [];
    throw error;
  }
  return (data as ManualExtractCandidateRow[]) || [];
}

export async function supersedeExtractsForVehicle(opts: {
  client: SupabaseClient;
  userId: string;
  vehicleId: string;
  manualId?: string;
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
}): Promise<ManualExtractCandidateRow[]> {
  const guesses = extractOilGuessesFromChunks(opts.chunks);
  await supersedeExtractsForVehicle({
    client: opts.client,
    userId: opts.userId,
    vehicleId: opts.vehicleId,
  });
  if (!guesses.length) return [];

  const rows = guesses.map((g) => ({
    user_id: opts.userId,
    vehicle_id: opts.vehicleId,
    manual_id: opts.manualId,
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

export async function clearManualConfirmedFluids(opts: {
  client: SupabaseClient;
  userId: string;
  vehicleId: string;
}): Promise<void> {
  const { data, error } = await opts.client
    .from("user_vehicles")
    .select("oil_capacity_source, oil_viscosity_source")
    .eq("id", opts.vehicleId)
    .eq("user_id", opts.userId)
    .maybeSingle();
  if (error) {
    if (/oil_capacity_source|oil_viscosity_source/i.test(error.message)) return;
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
  if (Object.keys(patch).length === 0) return;
  patch.oil_specs_confirmed_at = null;
  const { error: upErr } = await opts.client
    .from("user_vehicles")
    .update(patch)
    .eq("id", opts.vehicleId)
    .eq("user_id", opts.userId);
  if (upErr && !/oil_capacity_source|oil_specs_confirmed_at/i.test(upErr.message)) {
    throw upErr;
  }
}

export function isManualConfirmedSource(
  source: string | null | undefined,
): boolean {
  return source === "user_manual_confirmed";
}
