/**
 * Adopt a Coach step (or completion summary) into knowledge_base for RAG.
 * Does not mutate playbook JSON — write-only path.
 */

import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { tryGenerateKnowledgeEmbedding } from "@/lib/rag";

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
};

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

  const qualityScore = resolveQualityScore(input);
  const kind = input.kind || "step";
  const ingestKey = `coach_adopt:${input.scenarioSlug}:${input.stepId}:${kind}`;
  const content = buildContent(input);
  const kbTitle = `[Coach] ${title}`.slice(0, 200);

  const embedding = await tryGenerateKnowledgeEmbedding(`${kbTitle}\n${content}`);

  const metadata: Record<string, unknown> = {
    ingest_key: ingestKey,
    scenario_slug: input.scenarioSlug,
    scenario_id: input.scenarioId,
    step_id: input.stepId,
    corpus: "coach_adopt",
    rag_tier: "repair",
    quality_score: qualityScore,
    useful_votes: input.lastVote === "yes" ? 1 : 0,
    downvotes: input.lastVote === "no" ? 1 : 0,
    adopted_by: input.userId,
    adopted_at: new Date().toISOString(),
    kind,
  };

  const row: Record<string, unknown> = {
    title: kbTitle,
    content,
    source: "coach_adopt",
    category: "repair",
    vehicle_make: input.vehicleMake ?? null,
    vehicle_model: input.vehicleModel ?? null,
    vehicle_years: input.vehicleYears ?? null,
    is_active: true,
    metadata,
    updated_at: new Date().toISOString(),
  };
  if (embedding) row.embedding = embedding;

  const admin = createSupabaseAdmin();

  const { data: existing } = await admin
    .from("knowledge_base")
    .select("id, metadata")
    .contains("metadata", { ingest_key: ingestKey })
    .maybeSingle();

  // Re-adopt: keep / bump vote counters so RAG soft ranking can improve over time
  if (existing?.id) {
    const prevMeta =
      existing.metadata && typeof existing.metadata === "object"
        ? (existing.metadata as Record<string, unknown>)
        : {};
    const prevUseful = Number(prevMeta.useful_votes) || 0;
    const prevDown = Number(prevMeta.downvotes) || 0;
    metadata.useful_votes =
      prevUseful + (input.lastVote === "yes" ? 1 : 0);
    metadata.downvotes = prevDown + (input.lastVote === "no" ? 1 : 0);
    const prevQ = Number(prevMeta.quality_score);
    if (Number.isFinite(prevQ)) {
      metadata.quality_score = Math.max(prevQ, qualityScore);
    }
    row.metadata = metadata;
  }

  let knowledgeId: string;
  if (existing?.id) {
    const { data, error } = await admin
      .from("knowledge_base")
      .update(row)
      .eq("id", existing.id)
      .select("id")
      .single();
    if (error) throw error;
    knowledgeId = data.id as string;
  } else {
    const { data, error } = await admin
      .from("knowledge_base")
      .insert(row)
      .select("id")
      .single();
    if (error) throw error;
    knowledgeId = data.id as string;
  }

  // Mirror into golden_qa for fine-tune export (best-effort; no unique key)
  try {
    const { data: existingGolden } = await admin
      .from("golden_qa")
      .select("id")
      .contains("metadata", { ingest_key: ingestKey })
      .maybeSingle();
    if (!existingGolden?.id) {
      await admin.from("golden_qa").insert({
        question: `Coach step: ${input.scenarioSlug} / ${input.stepId} — ${title}`,
        answer: content,
        title: kbTitle,
        category: "coach",
        vehicle_make: input.vehicleMake ?? null,
        vehicle_model: input.vehicleModel ?? null,
        source_type: "coach_adopt",
        source_id: null,
        knowledge_base_id: knowledgeId,
        quality_score: qualityScore,
        metadata: {
          scenario_slug: input.scenarioSlug,
          step_id: input.stepId,
          ingest_key: ingestKey,
        },
        updated_at: new Date().toISOString(),
      });
    }
  } catch {
    /* golden optional */
  }

  try {
    await admin.from("admin_audit_logs").insert({
      actor_email: input.userId,
      action: "coach_adopt_knowledge",
      module: "knowledge",
      target_type: "knowledge_base",
      target_id: knowledgeId,
      detail: { ingestKey, scenarioSlug: input.scenarioSlug, stepId: input.stepId },
    });
  } catch {
    /* audit optional */
  }

  return {
    knowledgeId,
    ingestKey,
    embedded: Boolean(embedding),
    qualityScore,
  };
}
