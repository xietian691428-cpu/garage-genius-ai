/**
 * Adopt a Coach step (or completion summary) into knowledge_base for RAG,
 * then enqueue flywheel for admin review.
 * Does not mutate playbook JSON — write-only path.
 *
 * Dedupes by scenario + step + kind + vehicle make/model so multiple users
 * adopting the same step for the same vehicle bump votes instead of new rows.
 */

import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { tryGenerateKnowledgeEmbedding } from "@/lib/rag";
import { enqueueCoachAdopt } from "@/lib/flywheel";

export type CoachAdoptKnowledgeInput = {
  scenarioSlug: string;
  scenarioId: string;
  stepId: string;
  title: string;
  description: string;
  /** Optional coach encourage / checks / safety lines */
  coachEncourage?: string | null;
  safetyWarning?: string | null;
  trustNudge?: string | null;
  personalize?: string | null;
  /** completion | step */
  kind?: "step" | "completion";
  /** 1–5; default from vote if provided */
  qualityScore?: number;
  lastVote?: "yes" | "no" | null;
  vehicleMake?: string | null;
  vehicleModel?: string | null;
  vehicleYears?: string | null;
  userId: string;
};

export type CoachAdoptKnowledgeResult = {
  knowledgeId: string;
  ingestKey: string;
  embedded: boolean;
  qualityScore: number;
  /** True when an existing make/model row was bumped instead of inserted */
  deduped: boolean;
  flywheelEnqueued: boolean;
  flywheelQueueId?: string;
};

/** Normalize make/model for stable ingest_key segments. */
export function normalizeVehicleToken(value?: string | null): string {
  const t = (value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  return t || "generic";
}

export function buildCoachAdoptIngestKey(input: {
  scenarioSlug: string;
  stepId: string;
  kind: "step" | "completion";
  vehicleMake?: string | null;
  vehicleModel?: string | null;
}): string {
  const make = normalizeVehicleToken(input.vehicleMake);
  const model = normalizeVehicleToken(input.vehicleModel);
  return `coach_adopt:${input.scenarioSlug}:${input.stepId}:${input.kind}:${make}:${model}`;
}

function resolveQualityScore(input: CoachAdoptKnowledgeInput): number {
  if (
    typeof input.qualityScore === "number" &&
    Number.isFinite(input.qualityScore)
  ) {
    return Math.max(1, Math.min(5, input.qualityScore));
  }
  if (input.lastVote === "yes") return 4;
  if (input.lastVote === "no") return 2;
  return 3;
}

function buildContent(input: CoachAdoptKnowledgeInput): string {
  const parts: string[] = [
    `## ${input.title.trim()}`,
    "",
    input.description.trim(),
  ];
  if (input.coachEncourage?.trim()) {
    parts.push("", `### Coach note`, input.coachEncourage.trim());
  }
  if (input.personalize?.trim()) {
    parts.push("", `### Vehicle context`, input.personalize.trim());
  }
  if (input.safetyWarning?.trim()) {
    parts.push("", `### Safety`, input.safetyWarning.trim());
  }
  if (input.trustNudge?.trim()) {
    parts.push("", `### Tip`, input.trustNudge.trim());
  }
  parts.push(
    "",
    `### Solution path`,
    `Problem: ${input.title.trim()}`,
    `Checks / guidance: see steps above.`,
    `Source: Coach playbook \`${input.scenarioSlug}\` / step \`${input.stepId}\`.`,
  );
  return parts.join("\n");
}

export async function adoptCoachStepAsKnowledge(
  input: CoachAdoptKnowledgeInput,
): Promise<CoachAdoptKnowledgeResult> {
  const title = input.title?.trim();
  const description = input.description?.trim();
  if (!input.scenarioSlug?.trim() || !input.stepId?.trim()) {
    throw new Error("scenarioSlug and stepId are required");
  }
  if (!title || !description) {
    throw new Error("title and description are required");
  }
  // Adopt CTA is only highlighted after Yes — enforce server-side too
  if (input.lastVote !== "yes") {
    throw new Error("Adopt requires a Yes usefulness vote first");
  }

  const qualityScore = resolveQualityScore(input);
  const kind = input.kind || "step";
  const makeNorm = normalizeVehicleToken(input.vehicleMake);
  const modelNorm = normalizeVehicleToken(input.vehicleModel);
  const ingestKey = buildCoachAdoptIngestKey({
    scenarioSlug: input.scenarioSlug,
    stepId: input.stepId,
    kind,
    vehicleMake: input.vehicleMake,
    vehicleModel: input.vehicleModel,
  });
  const content = buildContent(input);
  const kbTitle = `[Coach] ${title}`.slice(0, 200);

  const admin = createSupabaseAdmin();

  const { data: existing } = await admin
    .from("knowledge_base")
    .select("id, metadata")
    .contains("metadata", { ingest_key: ingestKey })
    .maybeSingle();

  let knowledgeId: string;
  let embedded = false;
  let deduped = false;

  if (existing?.id) {
    // Same step + make/model already adopted — bump votes only (no duplicate write)
    deduped = true;
    const prevMeta =
      existing.metadata && typeof existing.metadata === "object"
        ? (existing.metadata as Record<string, unknown>)
        : {};
    const prevUseful = Number(prevMeta.useful_votes) || 0;
    const prevQ = Number(prevMeta.quality_score);
    const nextMeta: Record<string, unknown> = {
      ...prevMeta,
      ingest_key: ingestKey,
      scenario_slug: input.scenarioSlug,
      scenario_id: input.scenarioId,
      step_id: input.stepId,
      corpus: "coach_adopt",
      make_norm: makeNorm,
      model_norm: modelNorm,
      useful_votes: prevUseful + 1,
      quality_score: Number.isFinite(prevQ)
        ? Math.max(prevQ, qualityScore)
        : qualityScore,
      last_adopted_by: input.userId,
      last_adopted_at: new Date().toISOString(),
      kind,
    };
    const { data, error } = await admin
      .from("knowledge_base")
      .update({
        metadata: nextMeta,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select("id")
      .single();
    if (error) throw error;
    knowledgeId = data.id as string;
  } else {
    const embedding = await tryGenerateKnowledgeEmbedding(
      `${kbTitle}\n${content}`,
    );
    embedded = Boolean(embedding);

    const metadata: Record<string, unknown> = {
      ingest_key: ingestKey,
      scenario_slug: input.scenarioSlug,
      scenario_id: input.scenarioId,
      step_id: input.stepId,
      corpus: "coach_adopt",
      rag_tier: "repair",
      quality_score: qualityScore,
      useful_votes: 1,
      downvotes: 0,
      make_norm: makeNorm,
      model_norm: modelNorm,
      adopted_by: input.userId,
      adopted_at: new Date().toISOString(),
      kind,
      flywheel_pending: true,
    };

    const row: Record<string, unknown> = {
      title: kbTitle,
      content,
      source: "coach_adopt",
      category: "repair",
      vehicle_make: input.vehicleMake?.trim() || null,
      vehicle_model: input.vehicleModel?.trim() || null,
      vehicle_years: input.vehicleYears ?? null,
      is_active: true,
      metadata,
      updated_at: new Date().toISOString(),
    };
    if (embedding) row.embedding = embedding;

    const { data, error } = await admin
      .from("knowledge_base")
      .insert(row)
      .select("id")
      .single();
    if (error) throw error;
    knowledgeId = data.id as string;
  }

  // Admin review queue (idempotent per ingest_key / make+model)
  let flywheelEnqueued = false;
  let flywheelQueueId: string | undefined;
  try {
    const q = await enqueueCoachAdopt({
      ingestKey,
      userId: input.userId,
      scenarioSlug: input.scenarioSlug,
      scenarioId: input.scenarioId,
      stepId: input.stepId,
      vote: "yes",
      vehicleMake: input.vehicleMake?.trim() || null,
      vehicleModel: input.vehicleModel?.trim() || null,
      draftTitle: kbTitle,
      draftQuestion: `Coach adopt (${kind}): ${input.scenarioSlug} / ${input.stepId} — ${title}`,
      draftAnswer: content,
      knowledgeBaseId: knowledgeId,
    });
    flywheelEnqueued = q.enqueued;
    flywheelQueueId = q.id;
  } catch (err) {
    console.warn("[coach-adopt] flywheel enqueue failed", err);
  }

  try {
    await admin.from("admin_audit_logs").insert({
      actor_email: input.userId,
      action: "coach_adopt_knowledge",
      module: "knowledge",
      target_type: "knowledge_base",
      target_id: knowledgeId,
      detail: {
        ingestKey,
        scenarioSlug: input.scenarioSlug,
        stepId: input.stepId,
        deduped,
        flywheelEnqueued,
        flywheelQueueId,
        makeNorm,
        modelNorm,
      },
    });
  } catch {
    /* audit optional */
  }

  return {
    knowledgeId,
    ingestKey,
    embedded,
    qualityScore,
    deduped,
    flywheelEnqueued,
    flywheelQueueId,
  };
}
