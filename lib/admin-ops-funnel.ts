/**
 * Ops funnel + cost/revenue contrast (运营管理 scaffold data).
 */

import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { getAdminTokenStats } from "@/lib/admin-token-stats";
import { getAdminRevenueStats } from "@/lib/admin-revenue-stats";

export type OpsFunnelResponse = {
  funnel: {
    registered: number;
    trial: number;
    paid: number;
    renewed: number;
  };
  costVsRevenue: {
    estimatedCostUsd: number;
    revenueUsd: number;
    marginUsd: number;
  };
  generatedAt: string;
};

export async function getOpsFunnel(): Promise<OpsFunnelResponse> {
  const admin = createSupabaseAdmin();

  const [regRes, trialRes, paidRes, invoiceRes, tokenStats, revStats] =
    await Promise.all([
      admin.from("profiles").select("id", { count: "exact", head: true }),
      admin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .in("subscription_status", ["trialing", "trial"]),
      admin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .in("subscription_status", ["pro", "pro_heavy", "active"]),
      admin
        .from("stripe_revenue_events")
        .select("user_id, kind")
        .eq("kind", "subscription")
        .limit(20000),
      getAdminTokenStats("month"),
      getAdminRevenueStats(),
    ]);

  // Renewed ≈ users with 2+ subscription invoice events
  const invoiceByUser = new Map<string, number>();
  for (const row of invoiceRes.data ?? []) {
    const uid = row.user_id as string | null;
    if (!uid) continue;
    invoiceByUser.set(uid, (invoiceByUser.get(uid) || 0) + 1);
  }
  let renewed = 0;
  for (const n of invoiceByUser.values()) {
    if (n >= 2) renewed += 1;
  }

  const estimatedCostUsd = tokenStats.summary.totalCostUsd;
  const revenueUsd =
    revStats.summary.revenue30dUsd || revStats.summary.mrrUsd || 0;

  return {
    funnel: {
      registered: regRes.count ?? 0,
      trial: trialRes.count ?? 0,
      paid: paidRes.count ?? 0,
      renewed,
    },
    costVsRevenue: {
      estimatedCostUsd,
      revenueUsd,
      marginUsd: Math.round((revenueUsd - estimatedCostUsd) * 100) / 100,
    },
    generatedAt: new Date().toISOString(),
  };
}
