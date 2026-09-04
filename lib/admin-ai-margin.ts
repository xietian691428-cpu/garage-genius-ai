/**
 * Admin: UTC-month AI cost vs Stripe revenue (view or computed fallback).
 */

import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { utcMonthBounds } from "@/lib/ai-cost/period";
import { PLAN_AI_LIMITS } from "@/lib/ai-cost/plan-limits";

export type AiMarginByPlan = {
  plan: string;
  users: number;
  aiCostUsd: number;
  revenueUsd: number;
  marginUsd: number;
  visionCalls: number;
  budgetUsd: number | null;
};

export type AiMarginMonth = {
  periodYm: string;
  startIso: string;
  endIso: string;
  totals: {
    aiCostUsd: number;
    revenueUsd: number;
    marginUsd: number;
    visionCalls: number;
    users: number;
  };
  byPlan: AiMarginByPlan[];
};

function roundUsd(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function getAdminAiMarginMonth(): Promise<AiMarginMonth> {
  const bounds = utcMonthBounds();
  const admin = createSupabaseAdmin();

  const { data, error } = await admin
    .from("admin_ai_cost_vs_revenue_by_plan")
    .select("plan, users, ai_cost_usd, revenue_usd, margin_usd, vision_calls");

  if (!error && data) {
    const byPlan: AiMarginByPlan[] = (data as Array<Record<string, unknown>>).map(
      (row) => {
        const plan = String(row.plan || "unknown");
        const budget =
          plan === "free" || plan === "pro" || plan === "pro_heavy"
            ? PLAN_AI_LIMITS[plan].aiBudgetUsd
            : plan === "trialing"
              ? PLAN_AI_LIMITS.pro.aiBudgetUsd
              : null;
        return {
          plan,
          users: Number(row.users) || 0,
          aiCostUsd: roundUsd(Number(row.ai_cost_usd) || 0),
          revenueUsd: roundUsd(Number(row.revenue_usd) || 0),
          marginUsd: roundUsd(Number(row.margin_usd) || 0),
          visionCalls: Number(row.vision_calls) || 0,
          budgetUsd: budget,
        };
      },
    );
    byPlan.sort((a, b) => b.revenueUsd - a.revenueUsd);
    const totals = byPlan.reduce(
      (acc, row) => {
        acc.aiCostUsd += row.aiCostUsd;
        acc.revenueUsd += row.revenueUsd;
        acc.marginUsd += row.marginUsd;
        acc.visionCalls += row.visionCalls;
        acc.users += row.users;
        return acc;
      },
      { aiCostUsd: 0, revenueUsd: 0, marginUsd: 0, visionCalls: 0, users: 0 },
    );
    return {
      periodYm: bounds.periodYm,
      startIso: bounds.startIso,
      endIso: bounds.endIso,
      totals: {
        aiCostUsd: roundUsd(totals.aiCostUsd),
        revenueUsd: roundUsd(totals.revenueUsd),
        marginUsd: roundUsd(totals.marginUsd),
        visionCalls: totals.visionCalls,
        users: totals.users,
      },
      byPlan,
    };
  }

  return computeMarginFallback(admin, bounds);
}

async function computeMarginFallback(
  admin: ReturnType<typeof createSupabaseAdmin>,
  bounds: { startIso: string; endIso: string; periodYm: string },
): Promise<AiMarginMonth> {
  const [costRes, revRes] = await Promise.all([
    admin
      .from("token_usage_events")
      .select("user_id, cost_usd, provider, route")
      .gte("created_at", bounds.startIso)
      .lt("created_at", bounds.endIso)
      .limit(20_000),
    admin
      .from("stripe_revenue_events")
      .select("user_id, amount_cents")
      .gte("created_at", bounds.startIso)
      .lt("created_at", bounds.endIso)
      .limit(10_000),
  ]);

  const userIds = new Set<string>();
  const costByUser = new Map<string, { usd: number; vision: number }>();
  for (const row of costRes.data || []) {
    const uid = (row as { user_id?: string | null }).user_id;
    if (!uid) continue;
    userIds.add(uid);
    const cur = costByUser.get(uid) || { usd: 0, vision: 0 };
    cur.usd += Number((row as { cost_usd?: number }).cost_usd) || 0;
    const provider = String((row as { provider?: string }).provider || "");
    const route = String((row as { route?: string }).route || "");
    if (provider === "kimi" || route === "vision") cur.vision += 1;
    costByUser.set(uid, cur);
  }

  const revByUser = new Map<string, number>();
  for (const row of revRes.data || []) {
    const uid = (row as { user_id?: string | null }).user_id;
    if (!uid) continue;
    userIds.add(uid);
    revByUser.set(
      uid,
      (revByUser.get(uid) || 0) +
        (Number((row as { amount_cents?: number }).amount_cents) || 0) / 100,
    );
  }

  const ids = [...userIds];
  const planByUser = new Map<string, string>();
  if (ids.length > 0) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, subscription_status")
      .in("id", ids.slice(0, 1000));
    for (const p of profiles || []) {
      planByUser.set(
        String((p as { id: string }).id),
        String((p as { subscription_status?: string }).subscription_status || "free"),
      );
    }
  }

  const planMap = new Map<string, AiMarginByPlan>();
  for (const uid of ids) {
    const plan = planByUser.get(uid) || "free";
    const row = planMap.get(plan) || {
      plan,
      users: 0,
      aiCostUsd: 0,
      revenueUsd: 0,
      marginUsd: 0,
      visionCalls: 0,
      budgetUsd:
        plan === "free" || plan === "pro" || plan === "pro_heavy"
          ? PLAN_AI_LIMITS[plan].aiBudgetUsd
          : plan === "trialing"
            ? PLAN_AI_LIMITS.pro.aiBudgetUsd
            : null,
    };
    row.users += 1;
    row.aiCostUsd += costByUser.get(uid)?.usd || 0;
    row.revenueUsd += revByUser.get(uid) || 0;
    row.visionCalls += costByUser.get(uid)?.vision || 0;
    planMap.set(plan, row);
  }

  const byPlan = [...planMap.values()].map((row) => ({
    ...row,
    aiCostUsd: roundUsd(row.aiCostUsd),
    revenueUsd: roundUsd(row.revenueUsd),
    marginUsd: roundUsd(row.revenueUsd - row.aiCostUsd),
  }));
  byPlan.sort((a, b) => b.revenueUsd - a.revenueUsd);

  const totals = byPlan.reduce(
    (acc, row) => {
      acc.aiCostUsd += row.aiCostUsd;
      acc.revenueUsd += row.revenueUsd;
      acc.marginUsd += row.marginUsd;
      acc.visionCalls += row.visionCalls;
      acc.users += row.users;
      return acc;
    },
    { aiCostUsd: 0, revenueUsd: 0, marginUsd: 0, visionCalls: 0, users: 0 },
  );

  return {
    periodYm: bounds.periodYm,
    startIso: bounds.startIso,
    endIso: bounds.endIso,
    totals: {
      aiCostUsd: roundUsd(totals.aiCostUsd),
      revenueUsd: roundUsd(totals.revenueUsd),
      marginUsd: roundUsd(totals.marginUsd),
      visionCalls: totals.visionCalls,
      users: totals.users,
    },
    byPlan,
  };
}
