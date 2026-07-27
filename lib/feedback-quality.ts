/**
 * Apply Coach “Was this step useful?” votes onto knowledge_base / golden_qa
 * quality_score so RAG soft-ranking improves over time.
 * Fail-open — never blocks coach UX.
 */

import { createSupabaseAdmin } from "@/lib/supabase-admin";

function clampQuality(n: number): number {
  return Math.max(1, Math.min(5, Math.round(n)));
}

function bumpMeta(
  meta: Record<string, unknown>,
  vote: "yes" | "no",
): Record<string, unknown> {
  const useful = Number(meta.useful_votes) || 0;
  const down = Number(meta.downvotes) || 0;
  const quality = Number(meta.quality_score);
  const next = { ...meta };
  if (vote === "yes") {
    next.useful_votes = useful + 1;
    next.quality_score = clampQuality(
      Number.isFinite(quality) ? quality + 0.5 : 3.5,
    );
  } else {
    next.downvotes = down + 1;
    next.quality_score = clampQuality(
      Number.isFinite(quality) ? quality - 0.5 : 2.5,
    );
  }
  next.last_feedback_at = new Date().toISOString();
  return next;
}

/**
 * Find KB / golden rows tagged with this coach scenario and adjust quality.
 */
export async function applyCoachVoteToKnowledgeQuality(input: {
  scenarioSlug: string;
  stepId?: string | null;
  vote: "yes" | "no";
}): Promise<{ knowledgeUpdated: number; goldenUpdated: number }> {
  const slug = input.scenarioSlug?.trim();
  if (!slug) return { knowledgeUpdated: 0, goldenUpdated: 0 };

  let knowledgeUpdated = 0;
  let goldenUpdated = 0;

  try {
    const admin = createSupabaseAdmin();

    // Prefer contains(scenario_slug) — stable vs or() filter escaping
    const { data: kbBySlug } = await admin
      .from("knowledge_base")
      .select("id, metadata")
      .contains("metadata", { scenario_slug: slug })
      .eq("is_active", true)
      .limit(40);

    const { data: kbFlywheel } = await admin
      .from("knowledge_base")
      .select("id, metadata")
      .eq("source", "flywheel_golden")
      .eq("is_active", true)
      .limit(80);

    const seen = new Set<string>();
    const kbRows = [...(kbBySlug ?? []), ...(kbFlywheel ?? [])].filter((row) => {
      if (seen.has(row.id as string)) return false;
      seen.add(row.id as string);
      const meta =
        row.metadata && typeof row.metadata === "object"
          ? (row.metadata as Record<string, unknown>)
          : {};
      if (meta.scenario_slug === slug) return true;
      const key = typeof meta.ingest_key === "string" ? meta.ingest_key : "";
      return key.includes(slug);
    });

    for (const row of kbRows) {
      const meta =
        row.metadata && typeof row.metadata === "object"
          ? (row.metadata as Record<string, unknown>)
          : {};
      const nextMeta = bumpMeta(meta, input.vote);
      if (input.stepId) nextMeta.last_step_id = input.stepId;
      const { error } = await admin
        .from("knowledge_base")
        .update({
          metadata: nextMeta,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (!error) knowledgeUpdated += 1;
    }

    const { data: goldenRows } = await admin
      .from("golden_qa")
      .select("id, quality_score, metadata")
      .contains("metadata", { scenario_slug: slug })
      .limit(40);

    for (const row of goldenRows ?? []) {
      const q = Number(row.quality_score);
      const nextQ = clampQuality(
        input.vote === "yes"
          ? (Number.isFinite(q) ? q : 3) + 0.5
          : (Number.isFinite(q) ? q : 3) - 0.5,
      );
      const meta =
        row.metadata && typeof row.metadata === "object"
          ? bumpMeta(row.metadata as Record<string, unknown>, input.vote)
          : bumpMeta({ scenario_slug: slug }, input.vote);
      const { error } = await admin
        .from("golden_qa")
        .update({
          quality_score: nextQ,
          metadata: meta,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (!error) goldenUpdated += 1;
    }
  } catch (err) {
    console.warn("[feedback-quality]", err);
  }

  return { knowledgeUpdated, goldenUpdated };
}
