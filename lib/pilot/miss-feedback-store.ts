/**
 * Persist / list miss feedback (service role). Fail-open if table missing.
 */

import { createSupabaseAdmin } from "@/lib/supabase-admin";
import type {
  MissDimension,
  MissFeedbackRecord,
  MissFeedbackStatus,
  MissSeverity,
} from "@/lib/pilot/miss-feedback";
import { isMissDimension } from "@/lib/pilot/miss-feedback";

function mapRow(r: Record<string, unknown>): MissFeedbackRecord {
  const dims = Array.isArray(r.dimensions)
    ? (r.dimensions as unknown[]).filter(isMissDimension)
    : [];
  return {
    id: String(r.id),
    createdAt: String(r.created_at || ""),
    status: (r.status as MissFeedbackStatus) || "pending",
    dimensions: dims,
    severity: (r.severity as MissSeverity) || "medium",
    intentSnippet: String(r.intent_snippet || ""),
    replyDigest: String(r.reply_digest || ""),
    userHash: (r.user_hash as string) || undefined,
    vehicleYmm: (r.vehicle_ymm as string) || undefined,
    route: String(r.route || "chat"),
    appVersion: (r.app_version as string) || undefined,
    goldCatalogVersion:
      r.gold_catalog_version != null
        ? Number(r.gold_catalog_version)
        : undefined,
    diyPathHint: (r.diy_path_hint as string) || null,
    manualIntentHint: (r.manual_intent_hint as string) || null,
    stopRuleIds: Array.isArray(r.stop_rule_ids)
      ? (r.stop_rule_ids as string[])
      : [],
    hadGarageFluids: Boolean(r.had_garage_fluids),
    gatesRepaired: Boolean(r.gates_repaired),
    notes: (r.notes as string) || null,
    goldDraft: r.gold_draft ?? undefined,
    source:
      (r.source as MissFeedbackRecord["source"]) || "chat_auto",
  };
}

const MISSING_TABLE =
  /miss_feedback_queue|does not exist|schema cache/i;

/** Best-effort insert. Never throws to Chat. */
export async function enqueueMissFeedback(
  record: MissFeedbackRecord,
): Promise<{ ok: boolean; id?: string; skipped?: string }> {
  try {
    const admin = createSupabaseAdmin();
    const { data, error } = await admin
      .from("miss_feedback_queue")
      .insert({
        status: record.status || "pending",
        dimensions: record.dimensions,
        severity: record.severity,
        intent_snippet: record.intentSnippet,
        reply_digest: record.replyDigest,
        user_hash: record.userHash ?? null,
        vehicle_ymm: record.vehicleYmm ?? null,
        route: record.route || "chat",
        app_version: record.appVersion ?? null,
        gold_catalog_version: record.goldCatalogVersion ?? null,
        diy_path_hint: record.diyPathHint ?? null,
        manual_intent_hint: record.manualIntentHint ?? null,
        stop_rule_ids: record.stopRuleIds ?? [],
        had_garage_fluids: record.hadGarageFluids,
        gates_repaired: record.gatesRepaired,
        source: record.source || "chat_auto",
      })
      .select("id")
      .maybeSingle();

    if (error) {
      if (MISSING_TABLE.test(error.message || "")) {
        return { ok: false, skipped: "table_missing" };
      }
      console.warn("[miss-feedback] enqueue failed", error.message);
      return { ok: false, skipped: "insert_error" };
    }
    return { ok: true, id: data?.id ? String(data.id) : undefined };
  } catch (err) {
    console.warn(
      "[miss-feedback] enqueue skipped",
      err instanceof Error ? err.message : String(err),
    );
    return { ok: false, skipped: "exception" };
  }
}

export async function listMissFeedback(opts?: {
  status?: MissFeedbackStatus | "all";
  dimension?: MissDimension | "";
  limit?: number;
}): Promise<{ items: MissFeedbackRecord[]; error?: string }> {
  try {
    const admin = createSupabaseAdmin();
    let q = admin
      .from("miss_feedback_queue")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(opts?.limit ?? 50, 1), 200));

    if (opts?.status && opts.status !== "all") {
      q = q.eq("status", opts.status);
    }
    if (opts?.dimension) {
      q = q.contains("dimensions", [opts.dimension]);
    }

    const { data, error } = await q;
    if (error) {
      if (MISSING_TABLE.test(error.message || "")) {
        return { items: [], error: "table_missing" };
      }
      return { items: [], error: error.message };
    }
    return {
      items: (data || []).map((r) => mapRow(r as Record<string, unknown>)),
    };
  } catch (err) {
    return {
      items: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function getMissFeedback(
  id: string,
): Promise<MissFeedbackRecord | null> {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("miss_feedback_queue")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return mapRow(data as Record<string, unknown>);
}

export async function updateMissFeedback(
  id: string,
  patch: {
    status?: MissFeedbackStatus;
    notes?: string;
    goldDraft?: unknown;
    reviewedBy?: string;
  },
): Promise<{ ok: boolean; error?: string }> {
  try {
    const admin = createSupabaseAdmin();
    const row: Record<string, unknown> = {};
    if (patch.status) row.status = patch.status;
    if (patch.notes != null) row.notes = patch.notes;
    if (patch.goldDraft !== undefined) row.gold_draft = patch.goldDraft;
    if (patch.status === "reviewed" || patch.status === "promoted_draft") {
      row.reviewed_at = new Date().toISOString();
      row.reviewed_by = patch.reviewedBy || "admin";
    }
    const { error } = await admin
      .from("miss_feedback_queue")
      .update(row)
      .eq("id", id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
