/**
 * Business management — Coach playbook usage + step feedback analytics.
 */

import { createSupabaseAdmin } from "@/lib/supabase-admin";

export type BusinessPlaybookFilters = {
  make?: string;
  model?: string;
  scenarioSlug?: string;
  vote?: "yes" | "no" | "";
  q?: string;
  limit?: number;
};

export type BusinessPlaybookRow = {
  id: string;
  userId: string | null;
  userEmail: string | null;
  scenarioSlug: string;
  scenarioId: string;
  stepId: string;
  vote: "yes" | "no";
  vehicleMake: string | null;
  vehicleModel: string | null;
  vehicleMileage: number | null;
  note: string | null;
  createdAt: string;
};

export type BusinessAnalytics = {
  totalFeedback: number;
  yesCount: number;
  noCount: number;
  usefulRate: number;
  topScenarios: Array<{ slug: string; count: number; yesRate: number }>;
  usageByPeriod: Array<{ periodYm: string; runs: number; users: number }>;
};

export type BusinessPlaybooksResponse = {
  rows: BusinessPlaybookRow[];
  analytics: BusinessAnalytics;
};

export async function getBusinessPlaybooks(
  filters: BusinessPlaybookFilters = {},
): Promise<BusinessPlaybooksResponse> {
  const admin = createSupabaseAdmin();
  const limit = Math.min(filters.limit ?? 200, 500);

  let feedbackQuery = admin
    .from("coach_step_feedback")
    .select(
      "id, user_id, scenario_slug, scenario_id, step_id, vote, vehicle_make, vehicle_model, vehicle_mileage, note, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (filters.make?.trim()) {
    feedbackQuery = feedbackQuery.ilike(
      "vehicle_make",
      `%${filters.make.trim()}%`,
    );
  }
  if (filters.model?.trim()) {
    feedbackQuery = feedbackQuery.ilike(
      "vehicle_model",
      `%${filters.model.trim()}%`,
    );
  }
  if (filters.scenarioSlug?.trim()) {
    feedbackQuery = feedbackQuery.ilike(
      "scenario_slug",
      `%${filters.scenarioSlug.trim()}%`,
    );
  }
  if (filters.vote === "yes" || filters.vote === "no") {
    feedbackQuery = feedbackQuery.eq("vote", filters.vote);
  }

  const [feedbackRes, usageRes] = await Promise.all([
    feedbackQuery,
    admin
      .from("coach_playbook_usage")
      .select("user_id, period_ym, run_count")
      .order("period_ym", { ascending: false })
      .limit(5000),
  ]);

  if (
    feedbackRes.error &&
    !/coach_step_feedback|does not exist|schema cache/i.test(
      feedbackRes.error.message,
    )
  ) {
    throw feedbackRes.error;
  }

  const feedback = feedbackRes.data ?? [];
  const userIds = [
    ...new Set(
      feedback
        .map((r) => r.user_id as string | null)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const emailByUser = new Map<string, string>();
  if (userIds.length) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, email")
      .in("id", userIds);
    for (const p of profiles ?? []) {
      if (p.id && p.email) emailByUser.set(p.id, p.email);
    }
  }

  let rows: BusinessPlaybookRow[] = feedback.map((r) => ({
    id: r.id as string,
    userId: (r.user_id as string) ?? null,
    userEmail: r.user_id
      ? emailByUser.get(r.user_id as string) ?? null
      : null,
    scenarioSlug: r.scenario_slug as string,
    scenarioId: r.scenario_id as string,
    stepId: r.step_id as string,
    vote: r.vote as "yes" | "no",
    vehicleMake: (r.vehicle_make as string) ?? null,
    vehicleModel: (r.vehicle_model as string) ?? null,
    vehicleMileage:
      typeof r.vehicle_mileage === "number" ? r.vehicle_mileage : null,
    note: (r.note as string) ?? null,
    createdAt: r.created_at as string,
  }));

  if (filters.q?.trim()) {
    const q = filters.q.trim().toLowerCase();
    rows = rows.filter(
      (r) =>
        r.userEmail?.toLowerCase().includes(q) ||
        r.scenarioSlug.toLowerCase().includes(q) ||
        r.stepId.toLowerCase().includes(q) ||
        r.note?.toLowerCase().includes(q),
    );
  }

  const yesCount = rows.filter((r) => r.vote === "yes").length;
  const noCount = rows.filter((r) => r.vote === "no").length;
  const totalFeedback = rows.length;

  const bySlug = new Map<string, { count: number; yes: number }>();
  for (const r of rows) {
    const cur = bySlug.get(r.scenarioSlug) || { count: 0, yes: 0 };
    cur.count += 1;
    if (r.vote === "yes") cur.yes += 1;
    bySlug.set(r.scenarioSlug, cur);
  }
  const topScenarios = [...bySlug.entries()]
    .map(([slug, v]) => ({
      slug,
      count: v.count,
      yesRate: v.count ? Math.round((v.yes / v.count) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const usageAgg = new Map<
    string,
    { runs: number; users: Set<string> }
  >();
  for (const u of usageRes.data ?? []) {
    const ym = String(u.period_ym);
    const cur = usageAgg.get(ym) || { runs: 0, users: new Set() };
    cur.runs += Number(u.run_count) || 0;
    if (u.user_id) cur.users.add(u.user_id as string);
    usageAgg.set(ym, cur);
  }
  const usageByPeriod = [...usageAgg.entries()]
    .map(([periodYm, v]) => ({
      periodYm,
      runs: v.runs,
      users: v.users.size,
    }))
    .sort((a, b) => b.periodYm.localeCompare(a.periodYm))
    .slice(0, 12);

  return {
    rows,
    analytics: {
      totalFeedback,
      yesCount,
      noCount,
      usefulRate: totalFeedback
        ? Math.round((yesCount / totalFeedback) * 1000) / 10
        : 0,
      topScenarios,
      usageByPeriod,
    },
  };
}

export type ChatThreadSummary = {
  vehicleId: string;
  userId: string;
  userEmail: string | null;
  messageCount: number;
  lastAt: string;
  preview: string;
};

export async function listRecentChatThreads(limit = 80): Promise<{
  threads: ChatThreadSummary[];
}> {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("chat_messages")
    .select("user_id, vehicle_id, content, role, created_at")
    .order("created_at", { ascending: false })
    .limit(4000);
  if (error) throw error;

  const map = new Map<string, ChatThreadSummary>();
  const emailsNeeded = new Set<string>();

  for (const row of data ?? []) {
    const userId = row.user_id as string;
    const vehicleId = row.vehicle_id as string;
    const key = `${userId}:${vehicleId}`;
    if (!map.has(key)) {
      emailsNeeded.add(userId);
      map.set(key, {
        vehicleId,
        userId,
        userEmail: null,
        messageCount: 0,
        lastAt: row.created_at as string,
        preview: String(row.content || "").slice(0, 120),
      });
    }
    const t = map.get(key)!;
    t.messageCount += 1;
  }

  if (emailsNeeded.size) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, email")
      .in("id", [...emailsNeeded]);
    const emailMap = new Map(
      (profiles ?? []).map((p) => [p.id as string, p.email as string]),
    );
    for (const t of map.values()) {
      t.userEmail = emailMap.get(t.userId) ?? null;
    }
  }

  return {
    threads: [...map.values()]
      .sort((a, b) => b.lastAt.localeCompare(a.lastAt))
      .slice(0, limit),
  };
}

export async function getChatThreadMessages(
  userId: string,
  vehicleId: string,
  limit = 200,
): Promise<
  Array<{
    id: string;
    role: string;
    content: string;
    createdAt: string;
  }>
> {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("chat_messages")
    .select("id, role, content, created_at")
    .eq("user_id", userId)
    .eq("vehicle_id", vehicleId)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id as string,
    role: r.role as string,
    content: r.content as string,
    createdAt: r.created_at as string,
  }));
}
