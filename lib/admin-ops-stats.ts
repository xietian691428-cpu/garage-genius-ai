/**
 * Admin homepage ops KPIs + trend series (7/30d).
 */

import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { getAdminRevenueStats } from "@/lib/admin-revenue-stats";

export type OpsRange = "7d" | "30d";

export type OpsOverviewResponse = {
  cards: {
    newCustomersToday: number;
    dauToday: number;
    rechargeMonthUsd: number;
    aiCallsToday: number;
    proMembers: number;
    arpuUsd: number;
  };
  trends: {
    range: OpsRange;
    days: Array<{
      date: string;
      newCustomers: number;
      dau: number;
      revenueUsd: number;
      tokens: number;
    }>;
  };
  generatedAt: string;
};

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfUtcDay(d = new Date()): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}

function enumerateDays(range: OpsRange): string[] {
  const n = range === "7d" ? 7 : 30;
  const end = startOfUtcDay();
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(end);
    d.setUTCDate(d.getUTCDate() - i);
    out.push(dayKey(d));
  }
  return out;
}

export async function getOpsOverview(
  range: OpsRange = "7d",
): Promise<OpsOverviewResponse> {
  const admin = createSupabaseAdmin();
  const todayStart = startOfUtcDay();
  const todayIso = todayStart.toISOString();
  const monthStart = new Date(
    Date.UTC(todayStart.getUTCFullYear(), todayStart.getUTCMonth(), 1),
  );
  const trendStart = new Date(todayStart);
  trendStart.setUTCDate(trendStart.getUTCDate() - (range === "7d" ? 6 : 29));

  const [
    newTodayRes,
    eventsTodayRes,
    rechargeMonthRes,
    revenueMonthRes,
    proRes,
    revStats,
    profilesTrendRes,
    eventsTrendRes,
    revenueTrendRes,
  ] = await Promise.all([
    admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .gte("created_at", todayIso),
    admin
      .from("token_usage_events")
      .select("user_id, total_tokens, created_at")
      .gte("created_at", todayIso)
      .limit(20000),
    admin
      .from("token_purchases")
      .select("amount_usd")
      .gte("created_at", monthStart.toISOString()),
    admin
      .from("stripe_revenue_events")
      .select("amount_cents")
      .gte("created_at", monthStart.toISOString()),
    admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .in("subscription_status", ["pro", "pro_heavy", "active", "trialing"]),
    getAdminRevenueStats(),
    admin
      .from("profiles")
      .select("created_at")
      .gte("created_at", trendStart.toISOString())
      .limit(20000),
    admin
      .from("token_usage_events")
      .select("user_id, total_tokens, created_at")
      .gte("created_at", trendStart.toISOString())
      .limit(50000),
    admin
      .from("stripe_revenue_events")
      .select("amount_cents, created_at")
      .gte("created_at", trendStart.toISOString())
      .limit(20000),
  ]);

  const eventsToday = eventsTodayRes.data ?? [];
  const dauSet = new Set(
    eventsToday
      .map((e) => e.user_id as string | null)
      .filter((id): id is string => Boolean(id)),
  );

  const rechargeMonthUsd = (rechargeMonthRes.data ?? []).reduce(
    (s, r) => s + (Number(r.amount_usd) || 0),
    0,
  );
  const stripeMonthUsd = (revenueMonthRes.data ?? []).reduce(
    (s, r) => s + (Number(r.amount_cents) || 0) / 100,
    0,
  );

  const days = enumerateDays(range);
  const newByDay = new Map<string, number>();
  const dauByDay = new Map<string, Set<string>>();
  const revByDay = new Map<string, number>();
  const tokByDay = new Map<string, number>();
  for (const d of days) {
    newByDay.set(d, 0);
    dauByDay.set(d, new Set());
    revByDay.set(d, 0);
    tokByDay.set(d, 0);
  }

  for (const p of profilesTrendRes.data ?? []) {
    const k = String(p.created_at).slice(0, 10);
    if (newByDay.has(k)) newByDay.set(k, (newByDay.get(k) || 0) + 1);
  }
  for (const e of eventsTrendRes.data ?? []) {
    const k = String(e.created_at).slice(0, 10);
    if (!dauByDay.has(k)) continue;
    if (e.user_id) dauByDay.get(k)!.add(e.user_id as string);
    tokByDay.set(
      k,
      (tokByDay.get(k) || 0) + (Number(e.total_tokens) || 0),
    );
  }
  for (const r of revenueTrendRes.data ?? []) {
    const k = String(r.created_at).slice(0, 10);
    if (!revByDay.has(k)) continue;
    revByDay.set(
      k,
      (revByDay.get(k) || 0) + (Number(r.amount_cents) || 0) / 100,
    );
  }

  return {
    cards: {
      newCustomersToday: newTodayRes.count ?? 0,
      dauToday: dauSet.size,
      rechargeMonthUsd: Math.round((rechargeMonthUsd + stripeMonthUsd) * 100) / 100,
      aiCallsToday: eventsToday.length,
      proMembers: proRes.count ?? 0,
      arpuUsd: revStats.summary.arpuUsd,
    },
    trends: {
      range,
      days: days.map((date) => ({
        date,
        newCustomers: newByDay.get(date) || 0,
        dau: dauByDay.get(date)?.size || 0,
        revenueUsd: Math.round((revByDay.get(date) || 0) * 100) / 100,
        tokens: tokByDay.get(date) || 0,
      })),
    },
    generatedAt: new Date().toISOString(),
  };
}
