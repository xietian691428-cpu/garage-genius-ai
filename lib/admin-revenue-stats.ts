/**
 * Admin revenue aggregates — MRR / ARPU / paid users.
 */

import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { catalogMonthlyCents } from "@/lib/stripe-subscriptions";
import type { PaidPlan } from "@/lib/types/subscription";

export type RevenueStatsResponse = {
  summary: {
    mrrUsd: number;
    arrUsd: number;
    arpuUsd: number;
    paidSubscribers: number;
    trialing: number;
    freeUsers: number;
    totalUsers: number;
    revenue30dUsd: number;
    recharge30dUsd: number;
  };
  byPlan: Array<{
    plan: string;
    subscribers: number;
    mrrUsd: number;
  }>;
  recentRevenue: Array<{
    id: string;
    kind: string;
    amountUsd: number;
    plan: string | null;
    createdAt: string;
  }>;
};

type SubRow = {
  plan: string;
  status: string;
  amount_cents: number;
  billing_interval: "month" | "year" | null;
  currency: string;
};

function toMrrCents(row: SubRow): number {
  const plan = (row.plan === "pro_heavy" ? "pro_heavy" : "pro") as PaidPlan;
  if (row.status !== "active" && row.status !== "trialing") return 0;
  // Trialing counts toward "committed" MRR at list price (common SaaS practice)
  if (row.amount_cents > 0) {
    if (row.billing_interval === "year") {
      return Math.round(row.amount_cents / 12);
    }
    return row.amount_cents;
  }
  return catalogMonthlyCents(plan, row.billing_interval);
}

export async function getAdminRevenueStats(): Promise<RevenueStatsResponse> {
  const admin = createSupabaseAdmin();

  const [subsRes, profilesRes, revenueRes, purchasesRes] = await Promise.all([
    admin
      .from("stripe_subscriptions")
      .select("plan, status, amount_cents, billing_interval, currency"),
    admin.from("profiles").select("subscription_status"),
    admin
      .from("stripe_revenue_events")
      .select("id, kind, amount_cents, plan, created_at")
      .gte(
        "created_at",
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      )
      .order("created_at", { ascending: false })
      .limit(200),
    admin
      .from("token_purchases")
      .select("amount_usd, created_at")
      .gte(
        "created_at",
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      ),
  ]);

  // Graceful empty if migrations not applied
  const subs = (!subsRes.error ? (subsRes.data as SubRow[]) : []) || [];
  const profiles =
    (!profilesRes.error
      ? (profilesRes.data as { subscription_status: string }[])
      : []) || [];
  const revenueEvents =
    (!revenueRes.error
      ? (revenueRes.data as {
          id: string;
          kind: string;
          amount_cents: number;
          plan: string | null;
          created_at: string;
        }[])
      : []) || [];
  const purchases =
    (!purchasesRes.error
      ? (purchasesRes.data as { amount_usd: number; created_at: string }[])
      : []) || [];

  let mrrCents = 0;
  let paidSubscribers = 0;
  const planMap = new Map<string, { subscribers: number; mrrCents: number }>();

  for (const row of subs) {
    if (row.status !== "active" && row.status !== "trialing") continue;
    const mrr = toMrrCents(row);
    if (row.status === "active") {
      paidSubscribers += 1;
      mrrCents += mrr;
      const bucket = planMap.get(row.plan) || { subscribers: 0, mrrCents: 0 };
      bucket.subscribers += 1;
      bucket.mrrCents += mrr;
      planMap.set(row.plan, bucket);
    }
  }

  // Fallback: if stripe_subscriptions empty, estimate from profiles + catalog
  if (subs.length === 0 && profiles.length > 0) {
    for (const p of profiles) {
      const s = p.subscription_status;
      if (s === "pro" || s === "active") {
        paidSubscribers += 1;
        mrrCents += catalogMonthlyCents("pro", "month");
        const bucket = planMap.get("pro") || { subscribers: 0, mrrCents: 0 };
        bucket.subscribers += 1;
        bucket.mrrCents += catalogMonthlyCents("pro", "month");
        planMap.set("pro", bucket);
      } else if (s === "pro_heavy") {
        paidSubscribers += 1;
        mrrCents += catalogMonthlyCents("pro_heavy", "month");
        const bucket = planMap.get("pro_heavy") || {
          subscribers: 0,
          mrrCents: 0,
        };
        bucket.subscribers += 1;
        bucket.mrrCents += catalogMonthlyCents("pro_heavy", "month");
        planMap.set("pro_heavy", bucket);
      }
    }
  }

  let trialing = 0;
  let freeUsers = 0;
  for (const p of profiles) {
    if (p.subscription_status === "trialing") trialing += 1;
    else if (
      p.subscription_status === "free" ||
      p.subscription_status === "canceled"
    ) {
      freeUsers += 1;
    }
  }

  const revenue30dCents = revenueEvents.reduce(
    (sum, e) => sum + (Number(e.amount_cents) || 0),
    0,
  );
  const recharge30dUsd = purchases.reduce(
    (sum, p) => sum + (Number(p.amount_usd) || 0),
    0,
  );

  const mrrUsd = mrrCents / 100;
  const arpuUsd = paidSubscribers > 0 ? mrrUsd / paidSubscribers : 0;

  return {
    summary: {
      mrrUsd: Math.round(mrrUsd * 100) / 100,
      arrUsd: Math.round(mrrUsd * 12 * 100) / 100,
      arpuUsd: Math.round(arpuUsd * 100) / 100,
      paidSubscribers,
      trialing,
      freeUsers,
      totalUsers: profiles.length,
      revenue30dUsd: Math.round((revenue30dCents / 100) * 100) / 100,
      recharge30dUsd: Math.round(recharge30dUsd * 100) / 100,
    },
    byPlan: [...planMap.entries()].map(([plan, v]) => ({
      plan,
      subscribers: v.subscribers,
      mrrUsd: Math.round((v.mrrCents / 100) * 100) / 100,
    })),
    recentRevenue: revenueEvents.slice(0, 30).map((e) => ({
      id: e.id,
      kind: e.kind,
      amountUsd: Math.round((Number(e.amount_cents) / 100) * 100) / 100,
      plan: e.plan,
      createdAt: e.created_at,
    })),
  };
}
