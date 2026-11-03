/**
 * Admin observe for private manuals — rates from existing tables (no extra events DB).
 */

import { createSupabaseAdmin } from "@/lib/supabase-admin";

export type ManualStatsWindow = {
  days: number;
  since: string;
  uploads: number;
  ready: number;
  failed: number;
  processing: number;
  failRate: number | null;
  mismatch: number;
  mismatchRate: number | null;
  extractPending: number;
  extractConfirmed: number;
  extractRejected: number;
  /** confirmed / (confirmed + rejected) when user decided */
  saveSpecsAmongDecidedRate: number | null;
  /** confirmed / all extract rows in window (incl. still pending) */
  saveSpecsOfShownRate: number | null;
  garageFromManual: number;
};

export type ManualStatsResponse = {
  windows: ManualStatsWindow[];
  note: string;
};

function rate(num: number, den: number): number | null {
  if (den <= 0) return null;
  return Math.round((num / den) * 1000) / 10;
}

async function windowStats(days: number): Promise<ManualStatsWindow> {
  const admin = createSupabaseAdmin();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data: manuals, error: mErr } = await admin
    .from("vehicle_manuals")
    .select("id,status,ymm_match,created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(5000);
  if (mErr) throw mErr;

  const rows = manuals || [];
  const uploads = rows.length;
  const ready = rows.filter((r) => r.status === "ready").length;
  const failed = rows.filter((r) => r.status === "failed").length;
  const processing = rows.filter((r) => r.status === "processing").length;
  const mismatch = rows.filter((r) => r.ymm_match === "mismatch").length;

  const { data: extracts, error: eErr } = await admin
    .from("vehicle_manual_extract_candidates")
    .select("id,status,created_at")
    .gte("created_at", since)
    .limit(5000);
  if (eErr && !/does not exist|schema cache/i.test(eErr.message)) throw eErr;
  const ex = extracts || [];
  const extractPending = ex.filter((r) => r.status === "pending").length;
  const extractConfirmed = ex.filter((r) => r.status === "confirmed").length;
  const extractRejected = ex.filter((r) => r.status === "rejected").length;
  const decided = extractConfirmed + extractRejected;
  const shown = decided + extractPending;

  const { count: garageFromManual, error: gErr } = await admin
    .from("user_vehicles")
    .select("id", { count: "exact", head: true })
    .eq("oil_capacity_source", "user_manual_confirmed");
  if (gErr && !/oil_capacity_source/i.test(gErr.message)) throw gErr;

  return {
    days,
    since,
    uploads,
    ready,
    failed,
    processing,
    failRate: rate(failed, uploads),
    mismatch,
    mismatchRate: rate(mismatch, uploads),
    extractPending,
    extractConfirmed,
    extractRejected,
    saveSpecsAmongDecidedRate: rate(extractConfirmed, decided),
    saveSpecsOfShownRate: rate(extractConfirmed, shown),
    garageFromManual: garageFromManual ?? 0,
  };
}

export async function getManualStats(): Promise<ManualStatsResponse> {
  const windows = await Promise.all([windowStats(7), windowStats(30)]);
  return {
    windows,
    note:
      "Grep production logs: [manual-observe]. failRate=failed/uploads; mismatchRate=mismatch/uploads; Save specs = extract confirm rates.",
  };
}
