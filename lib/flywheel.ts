/**
 * Data flywheel — review queue → golden_qa → knowledge_base (RAG self-heal)
 * + JSONL export for offline DeepSeek fine-tune.
 */

import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { tryGenerateKnowledgeEmbedding } from "@/lib/rag";

export type FlywheelQueueStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "promoted";

export type FlywheelQueueItem = {
  id: string;
  sourceType: string;
  sourceId: string | null;
  userId: string | null;
  scenarioSlug: string | null;
  scenarioId: string | null;
  stepId: string | null;
  vote: string | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
  note: string | null;
  status: FlywheelQueueStatus;
  draftTitle: string | null;
  draftQuestion: string | null;
  draftAnswer: string | null;
  draftCategory: string | null;
  goldenQaId: string | null;
  knowledgeBaseId: string | null;
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
};

export type GoldenQaRow = {
  id: string;
  question: string;
  answer: string;
  title: string | null;
  category: string;
  vehicleMake: string | null;
  vehicleModel: string | null;
  knowledgeBaseId: string | null;
  usedInFinetuneAt: string | null;
  createdAt: string;
};

function mapQueue(r: Record<string, unknown>): FlywheelQueueItem {
  return {
    id: r.id as string,
    sourceType: r.source_type as string,
    sourceId: (r.source_id as string) ?? null,
    userId: (r.user_id as string) ?? null,
    scenarioSlug: (r.scenario_slug as string) ?? null,
    scenarioId: (r.scenario_id as string) ?? null,
    stepId: (r.step_id as string) ?? null,
    vote: (r.vote as string) ?? null,
    vehicleMake: (r.vehicle_make as string) ?? null,
    vehicleModel: (r.vehicle_model as string) ?? null,
    note: (r.note as string) ?? null,
    status: r.status as FlywheelQueueStatus,
    draftTitle: (r.draft_title as string) ?? null,
    draftQuestion: (r.draft_question as string) ?? null,
    draftAnswer: (r.draft_answer as string) ?? null,
    draftCategory: (r.draft_category as string) ?? null,
    goldenQaId: (r.golden_qa_id as string) ?? null,
    knowledgeBaseId: (r.knowledge_base_id as string) ?? null,
    createdAt: r.created_at as string,
    reviewedAt: (r.reviewed_at as string) ?? null,
    reviewedBy: (r.reviewed_by as string) ?? null,
  };
}

/** Enqueue a coach “no” vote into the review queue (idempotent on source_id). */
export async function enqueueCoachFeedback(row: {
  id: string;
  user_id?: string | null;
  scenario_slug: string;
  scenario_id: string;
  step_id: string;
  vote: string;
  vehicle_make?: string | null;
  vehicle_model?: string | null;
  note?: string | null;
}): Promise<{ enqueued: boolean; id?: string }> {
  if (row.vote !== "no") return { enqueued: false };

  const admin = createSupabaseAdmin();
  const draftQuestion = `Coach step feedback (not useful): ${row.scenario_slug} / ${row.step_id}`;
  const draftTitle = `[Flywheel] ${row.scenario_slug} · ${row.step_id}`;

  const { data: existing } = await admin
    .from("flywheel_review_queue")
    .select("id")
    .eq("source_type", "coach_step_feedback")
    .eq("source_id", row.id)
    .maybeSingle();
  if (existing?.id) return { enqueued: false, id: existing.id as string };

  const { data, error } = await admin
    .from("flywheel_review_queue")
    .insert({
      source_type: "coach_step_feedback",
      source_id: row.id,
      user_id: row.user_id ?? null,
      scenario_slug: row.scenario_slug,
      scenario_id: row.scenario_id,
      step_id: row.step_id,
      vote: row.vote,
      vehicle_make: row.vehicle_make ?? null,
      vehicle_model: row.vehicle_model ?? null,
      note: row.note ?? null,
      status: "pending",
      draft_title: draftTitle,
      draft_question: draftQuestion,
      draft_category: "coach",
    })
    .select("id")
    .maybeSingle();

  if (error) {
    if (/duplicate|unique/i.test(error.message)) {
      return { enqueued: false };
    }
    if (/flywheel_review_queue|does not exist|schema cache/i.test(error.message)) {
      console.warn("[flywheel] queue table missing — run migration 026");
      return { enqueued: false };
    }
    throw error;
  }

  return { enqueued: Boolean(data?.id), id: data?.id as string | undefined };
}

/** Backfill: pull recent coach “no” votes not yet in queue. */
export async function enqueueRecentCoachDownvotes(options?: {
  days?: number;
  limit?: number;
}): Promise<{ scanned: number; enqueued: number }> {
  const admin = createSupabaseAdmin();
  const days = options?.days ?? 7;
  const limit = Math.min(options?.limit ?? 200, 500);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await admin
    .from("coach_step_feedback")
    .select(
      "id, user_id, scenario_slug, scenario_id, step_id, vote, vehicle_make, vehicle_model, note",
    )
    .eq("vote", "no")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  let enqueued = 0;
  for (const row of data ?? []) {
    const r = await enqueueCoachFeedback({
      id: row.id as string,
      user_id: (row.user_id as string) ?? null,
      scenario_slug: row.scenario_slug as string,
      scenario_id: row.scenario_id as string,
      step_id: row.step_id as string,
      vote: row.vote as string,
      vehicle_make: (row.vehicle_make as string) ?? null,
      vehicle_model: (row.vehicle_model as string) ?? null,
      note: (row.note as string) ?? null,
    });
    if (r.enqueued) enqueued += 1;
  }

  return { scanned: (data ?? []).length, enqueued };
}

export async function listReviewQueue(options?: {
  status?: FlywheelQueueStatus | "all";
  limit?: number;
}): Promise<{ items: FlywheelQueueItem[]; pendingCount: number }> {
  const admin = createSupabaseAdmin();
  const limit = Math.min(options?.limit ?? 50, 200);
  const status = options?.status ?? "pending";

  let query = admin
    .from("flywheel_review_queue")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status !== "all") {
    query = query.eq("status", status);
  }

  const [listRes, countRes] = await Promise.all([
    query,
    admin
      .from("flywheel_review_queue")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
  ]);

  if (listRes.error) {
    if (/flywheel_review_queue|does not exist|schema cache/i.test(listRes.error.message)) {
      return { items: [], pendingCount: 0 };
    }
    throw listRes.error;
  }

  return {
    items: (listRes.data ?? []).map((r) => mapQueue(r as Record<string, unknown>)),
    pendingCount: countRes.count ?? 0,
  };
}

export async function updateReviewDraft(
  id: string,
  patch: {
    draftTitle?: string;
    draftQuestion?: string;
    draftAnswer?: string;
    draftCategory?: string;
    status?: "pending" | "approved" | "rejected";
    reviewedBy?: string;
  },
): Promise<FlywheelQueueItem> {
  const admin = createSupabaseAdmin();
  const row: Record<string, unknown> = {};
  if (patch.draftTitle !== undefined) row.draft_title = patch.draftTitle;
  if (patch.draftQuestion !== undefined) row.draft_question = patch.draftQuestion;
  if (patch.draftAnswer !== undefined) row.draft_answer = patch.draftAnswer;
  if (patch.draftCategory !== undefined) row.draft_category = patch.draftCategory;
  if (patch.status) {
    row.status = patch.status;
    row.reviewed_at = new Date().toISOString();
    row.reviewed_by = patch.reviewedBy ?? "admin";
  }

  const { data, error } = await admin
    .from("flywheel_review_queue")
    .update(row)
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return mapQueue(data as Record<string, unknown>);
}

/**
 * Promote reviewed item → golden_qa + knowledge_base (with embedding when possible).
 * This is the RAG “self-heal” path — no model retrain required.
 */
export async function promoteReviewToKnowledge(
  id: string,
  options?: { reviewedBy?: string },
): Promise<{
  item: FlywheelQueueItem;
  goldenQaId: string;
  knowledgeBaseId: string;
  embedded: boolean;
}> {
  const admin = createSupabaseAdmin();
  const { data: raw, error: loadErr } = await admin
    .from("flywheel_review_queue")
    .select("*")
    .eq("id", id)
    .single();
  if (loadErr) throw loadErr;

  const item = mapQueue(raw as Record<string, unknown>);
  const question = (item.draftQuestion || "").trim();
  const answer = (item.draftAnswer || "").trim();
  const title =
    (item.draftTitle || "").trim() ||
    `Flywheel: ${item.scenarioSlug || "qa"}`;

  if (!question || !answer) {
    throw new Error("draftQuestion and draftAnswer are required to promote");
  }

  const content = `Q: ${question}\n\nA: ${answer}`;
  const ingestKey = `flywheel:queue:${id}`;
  const embedding = await tryGenerateKnowledgeEmbedding(`${title}\n${content}`);

  const kbInsert: Record<string, unknown> = {
    title,
    content,
    source: "flywheel_golden",
    category: item.draftCategory || "repair",
    vehicle_make: item.vehicleMake,
    vehicle_model: item.vehicleModel,
    is_active: true,
    metadata: {
      ingest_key: ingestKey,
      flywheel_queue_id: id,
      scenario_slug: item.scenarioSlug,
      step_id: item.stepId,
    },
    updated_at: new Date().toISOString(),
  };
  if (embedding) kbInsert.embedding = embedding;

  // Upsert by ingest_key when unique index exists; else insert
  let knowledgeId: string | null = null;
  const existing = await admin
    .from("knowledge_base")
    .select("id")
    .contains("metadata", { ingest_key: ingestKey })
    .maybeSingle();

  if (existing.data?.id) {
    const { data: upd, error: updErr } = await admin
      .from("knowledge_base")
      .update(kbInsert)
      .eq("id", existing.data.id)
      .select("id")
      .single();
    if (updErr) throw updErr;
    knowledgeId = upd.id as string;
  } else {
    const { data: ins, error: insErr } = await admin
      .from("knowledge_base")
      .insert(kbInsert)
      .select("id")
      .single();
    if (insErr) throw insErr;
    knowledgeId = ins.id as string;
  }

  const { data: golden, error: gErr } = await admin
    .from("golden_qa")
    .insert({
      question,
      answer,
      title,
      category: item.draftCategory || "repair",
      vehicle_make: item.vehicleMake,
      vehicle_model: item.vehicleModel,
      source_type: item.sourceType,
      source_id: item.sourceId,
      review_queue_id: id,
      knowledge_base_id: knowledgeId,
      quality_score: 5,
      metadata: {
        scenario_slug: item.scenarioSlug,
        step_id: item.stepId,
      },
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (gErr) throw gErr;

  const { data: updated, error: qErr } = await admin
    .from("flywheel_review_queue")
    .update({
      status: "promoted",
      golden_qa_id: golden.id,
      knowledge_base_id: knowledgeId,
      reviewed_at: new Date().toISOString(),
      reviewed_by: options?.reviewedBy ?? "admin",
      draft_title: title,
      draft_question: question,
      draft_answer: answer,
    })
    .eq("id", id)
    .select("*")
    .single();
  if (qErr) throw qErr;

  await admin.from("admin_audit_logs").insert({
    actor_email: options?.reviewedBy ?? "admin",
    action: "flywheel_promote",
    module: "knowledge",
    target_type: "flywheel_review_queue",
    target_id: id,
    detail: { goldenQaId: golden.id, knowledgeBaseId: knowledgeId },
  });

  return {
    item: mapQueue(updated as Record<string, unknown>),
    goldenQaId: golden.id as string,
    knowledgeBaseId: knowledgeId!,
    embedded: Boolean(embedding),
  };
}

export async function listGoldenQa(limit = 100): Promise<GoldenQaRow[]> {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("golden_qa")
    .select(
      "id, question, answer, title, category, vehicle_make, vehicle_model, knowledge_base_id, used_in_finetune_at, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    if (/golden_qa|does not exist|schema cache/i.test(error.message)) return [];
    throw error;
  }
  return (data ?? []).map((r) => ({
    id: r.id as string,
    question: r.question as string,
    answer: r.answer as string,
    title: (r.title as string) ?? null,
    category: r.category as string,
    vehicleMake: (r.vehicle_make as string) ?? null,
    vehicleModel: (r.vehicle_model as string) ?? null,
    knowledgeBaseId: (r.knowledge_base_id as string) ?? null,
    usedInFinetuneAt: (r.used_in_finetune_at as string) ?? null,
    createdAt: r.created_at as string,
  }));
}

/** DeepSeek-style chat fine-tune JSONL lines from golden_qa. */
export async function exportGoldenFinetuneJsonl(options?: {
  onlyUnused?: boolean;
  markUsed?: boolean;
  limit?: number;
}): Promise<{ lines: string[]; count: number; ids: string[] }> {
  const admin = createSupabaseAdmin();
  const limit = Math.min(options?.limit ?? 500, 2000);
  let query = admin
    .from("golden_qa")
    .select("id, question, answer")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (options?.onlyUnused !== false) {
    query = query.is("used_in_finetune_at", null);
  }

  const { data, error } = await query;
  if (error) throw error;

  const system =
    "You are Garage Genius, a careful DIY auto-repair coach. Prefer safe, vehicle-aware guidance with clear next steps and disclaimers.";

  const ids: string[] = [];
  const lines: string[] = [];
  for (const r of data ?? []) {
    ids.push(r.id as string);
    lines.push(
      JSON.stringify({
        messages: [
          { role: "system", content: system },
          { role: "user", content: r.question },
          { role: "assistant", content: r.answer },
        ],
      }),
    );
  }

  if (options?.markUsed && ids.length) {
    await admin
      .from("golden_qa")
      .update({ used_in_finetune_at: new Date().toISOString() })
      .in("id", ids);
  }

  return { lines, count: lines.length, ids };
}

/** Log RAG hit snapshot (fail-open). */
export async function logRagRetrievalEvent(input: {
  userId?: string | null;
  route?: string;
  queryPreview: string;
  hitIds: string[];
  hitTitles: string[];
  vehicleMake?: string | null;
  vehicleModel?: string | null;
}): Promise<void> {
  try {
    const admin = createSupabaseAdmin();
    const { error } = await admin.from("rag_retrieval_events").insert({
      user_id: input.userId ?? null,
      route: input.route ?? "chat",
      query_preview: input.queryPreview.slice(0, 240),
      hit_ids: input.hitIds,
      hit_titles: input.hitTitles.map((t) => t.slice(0, 120)),
      hit_count: input.hitIds.length,
      vehicle_make: input.vehicleMake ?? null,
      vehicle_model: input.vehicleModel ?? null,
    });
    if (error && !/rag_retrieval_events|does not exist|schema cache/i.test(error.message)) {
      console.warn("[flywheel] rag log:", error.message);
    }
  } catch (err) {
    console.warn("[flywheel] rag log failed", err);
  }
}
