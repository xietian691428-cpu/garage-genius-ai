/**
 * Free vs Pro coach playbook start limits.
 * Free: 5 starts per 30-day window anchored on profiles.created_at (signup day).
 * Server-only counters in coach_playbook_usage.period_ym (text key).
 */

import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { tokenService } from "@/lib/token-service";
import { entitlementsForTier } from "@/lib/types/subscription";
import type { SubscriptionTier } from "@/lib/types/subscription";
import { isQaUnlockEnabled } from "@/lib/qa-mode";

/** Rolling quota window length (registration-day based). */
export const PLAYBOOK_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

export type PlaybookPeriod = {
  /** Stored in coach_playbook_usage.period_ym */
  key: string;
  periodIndex: number;
  periodStart: Date;
  /** Exclusive end / next reset instant */
  resetsAt: Date;
};

/**
 * 30-day cycles from registration timestamp.
 * Period 0 = [created_at, created_at + 30d), then rolls forward.
 */
export function playbookPeriodFromRegistration(
  registeredAt: Date | string,
  now = new Date(),
): PlaybookPeriod {
  const start = new Date(registeredAt);
  const t0 = Number.isFinite(start.getTime()) ? start.getTime() : now.getTime();
  const elapsed = Math.max(0, now.getTime() - t0);
  const periodIndex = Math.floor(elapsed / PLAYBOOK_PERIOD_MS);
  const periodStart = new Date(t0 + periodIndex * PLAYBOOK_PERIOD_MS);
  const resetsAt = new Date(t0 + (periodIndex + 1) * PLAYBOOK_PERIOD_MS);
  const regDay = new Date(t0).toISOString().slice(0, 10);
  return {
    key: `r30-${regDay}-${periodIndex}`,
    periodIndex,
    periodStart,
    resetsAt,
  };
}

/** @deprecated calendar month — kept for older rows; new writes use r30-* keys */
export function periodYm(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export type PlaybookQuota = {
  tier: SubscriptionTier;
  limit: number | null;
  used: number;
  remaining: number | null;
  unlimited: boolean;
  /** Active period key (null when unlimited / QA) */
  periodKey: string | null;
  /** ISO time when Free quota resets (null when unlimited) */
  resetsAt: string | null;
};

async function loadRegistrationAt(userId: string): Promise<Date> {
  const admin = createSupabaseAdmin();
  const { data } = await admin
    .from("profiles")
    .select("created_at")
    .eq("id", userId)
    .maybeSingle();
  if (data?.created_at) return new Date(data.created_at as string);
  return new Date();
}

export async function getPlaybookQuota(userId: string): Promise<PlaybookQuota> {
  if (isQaUnlockEnabled()) {
    return {
      tier: "pro_heavy",
      limit: null,
      used: 0,
      remaining: null,
      unlimited: true,
      periodKey: null,
      resetsAt: null,
    };
  }

  const plan = await tokenService.getUserPlan(userId);
  const tier: SubscriptionTier =
    plan === "pro_heavy" ? "pro_heavy" : plan === "pro" ? "pro" : "free";
  const limit = entitlementsForTier(tier).playbookRunsPerMonth;

  if (limit == null || limit <= 0) {
    return {
      tier,
      limit: null,
      used: 0,
      remaining: null,
      unlimited: true,
      periodKey: null,
      resetsAt: null,
    };
  }

  const registeredAt = await loadRegistrationAt(userId);
  const period = playbookPeriodFromRegistration(registeredAt);
  const admin = createSupabaseAdmin();
  const { data } = await admin
    .from("coach_playbook_usage")
    .select("run_count")
    .eq("user_id", userId)
    .eq("period_ym", period.key)
    .maybeSingle();

  const used = Number(data?.run_count) || 0;
  return {
    tier,
    limit,
    used,
    remaining: Math.max(0, limit - used),
    unlimited: false,
    periodKey: period.key,
    resetsAt: period.resetsAt.toISOString(),
  };
}

/**
 * Check + increment playbook start.
 * Returns ok:false when Free quota exhausted.
 */
export async function assertAndConsumePlaybookRun(
  userId: string,
  playbookSlug?: string | null,
): Promise<
  | { ok: true; quota: PlaybookQuota }
  | { ok: false; quota: PlaybookQuota; code: "playbook_limit" }
> {
  const before = await getPlaybookQuota(userId);
  if (before.unlimited) {
    return { ok: true, quota: before };
  }

  if ((before.remaining ?? 0) <= 0) {
    return { ok: false, quota: before, code: "playbook_limit" };
  }

  const periodKey = before.periodKey;
  if (!periodKey) {
    return { ok: true, quota: before };
  }

  const admin = createSupabaseAdmin();
  const next = before.used + 1;

  const { error } = await admin.from("coach_playbook_usage").upsert(
    {
      user_id: userId,
      period_ym: periodKey,
      run_count: next,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,period_ym" },
  );

  if (error) {
    console.warn("[playbook-usage]", error.message);
    // Fail open on missing table during rollout
    if (/coach_playbook_usage|does not exist|schema cache/i.test(error.message)) {
      return { ok: true, quota: before };
    }
  }

  void playbookSlug;
  const quota: PlaybookQuota = {
    ...before,
    used: next,
    remaining: Math.max(0, (before.limit ?? 0) - next),
  };
  return { ok: true, quota };
}
