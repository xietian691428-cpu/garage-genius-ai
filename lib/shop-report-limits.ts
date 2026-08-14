/**
 * Shop handoff report monthly quotas (UTC calendar month).
 * Counts successful rows in shop_reports for the signed-in user.
 *
 * Defaults (PLAN_ENTITLEMENTS + trial override):
 * - Free: 3 / UTC month
 * - Pro Trial: 30 / UTC month
 * - Pro / Pro Heavy: unlimited
 */

import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { resolveSubscription } from "@/lib/subscription";
import { isQaUnlockEnabled } from "@/lib/qa-mode";
import {
  TRIAL_SHOP_REPORTS_PER_MONTH,
  entitlementsForTier,
  type SubscriptionTier,
} from "@/lib/types/subscription";
import { AiAbuseError } from "@/lib/ai-abuse";

export const REPORT_LIMIT_CODE = "REPORT_LIMIT_REACHED";

/** UTC calendar month key: YYYY-MM */
export function shopReportPeriodYm(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function shopReportMonthBoundsUtc(d = new Date()): {
  startIso: string;
  endIso: string;
  periodYm: string;
} {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const start = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, m + 1, 1, 0, 0, 0, 0));
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    periodYm: shopReportPeriodYm(d),
  };
}

export type ShopReportQuota = {
  tier: SubscriptionTier;
  isTrialing: boolean;
  limit: number | null;
  used: number;
  remaining: number | null;
  unlimited: boolean;
  periodYm: string;
};

function resolveShopReportLimit(input: {
  tier: SubscriptionTier;
  isTrialing: boolean;
}): number | null {
  if (input.isTrialing) return TRIAL_SHOP_REPORTS_PER_MONTH;
  const fromPlan = entitlementsForTier(input.tier).shopReportsPerMonth;
  if (fromPlan == null || fromPlan <= 0) return null;
  return fromPlan;
}

export async function getShopReportQuota(
  userId: string,
  now = new Date(),
): Promise<ShopReportQuota> {
  const bounds = shopReportMonthBoundsUtc(now);

  if (isQaUnlockEnabled()) {
    return {
      tier: "pro_heavy",
      isTrialing: false,
      limit: null,
      used: 0,
      remaining: null,
      unlimited: true,
      periodYm: bounds.periodYm,
    };
  }

  const admin = createSupabaseAdmin();
  const { data: profile } = await admin
    .from("profiles")
    .select("email, subscription_status, trial_ends_at, stripe_subscription_id")
    .eq("id", userId)
    .maybeSingle();

  const resolved = resolveSubscription(profile);
  const limit = resolveShopReportLimit({
    tier: resolved.tier,
    isTrialing: resolved.isTrialing,
  });

  if (limit == null) {
    return {
      tier: resolved.tier,
      isTrialing: resolved.isTrialing,
      limit: null,
      used: 0,
      remaining: null,
      unlimited: true,
      periodYm: bounds.periodYm,
    };
  }

  const { count, error } = await admin
    .from("shop_reports")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", bounds.startIso)
    .lt("created_at", bounds.endIso);

  if (error) {
    console.error("[shop-report-quota]", error.message);
    throw new AiAbuseError(
      "Could not verify shop report quota. Please try again shortly.",
      503,
      "report_quota_unavailable",
    );
  }

  const used = count ?? 0;
  return {
    tier: resolved.tier,
    isTrialing: resolved.isTrialing,
    limit,
    used,
    remaining: Math.max(0, limit - used),
    unlimited: false,
    periodYm: bounds.periodYm,
  };
}

/** Throw AiAbuseError (402) when Free/Trial monthly shop-report cap is exhausted. */
export async function assertShopReportQuota(userId: string): Promise<ShopReportQuota> {
  const quota = await getShopReportQuota(userId);
  if (quota.unlimited) return quota;
  if ((quota.remaining ?? 0) <= 0) {
    throw new AiAbuseError(
      `Monthly shop report limit reached (${quota.limit} for this account in ${quota.periodYm} UTC). Try again next month.`,
      402,
      REPORT_LIMIT_CODE,
    );
  }
  return quota;
}

/** Pure helper for unit tests — decide limit from resolved flags. */
export function shopReportLimitForPlan(input: {
  tier: SubscriptionTier;
  isTrialing: boolean;
}): number | null {
  return resolveShopReportLimit(input);
}
