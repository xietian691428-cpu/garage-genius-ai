/**
 * Unified Trial / Pro subscription resolution (PROJECT.md Launch).
 * Pure helpers are safe on client + server; DB sync goes through RPC.
 */

import {
  PLAN_ENTITLEMENTS,
  entitlementsForTier,
  type PlanEntitlements,
  type Profile,
  type SubscriptionStatus,
  type SubscriptionTier,
} from "@/lib/types/subscription";
import { isLongLivedQaTrialEmail } from "@/lib/qa-test-account";
import { formatAppDate } from "@/lib/format-app-date";

/** Signup + Stripe Checkout trial length (days). */
export const TRIAL_DAYS = 14;

export const TRIAL_EXPIRED_PROMPT_KEY = "garageGenius_trialExpiredPrompt";
export const TRIAL_EXPIRED_SEEN_KEY = "garageGenius_trialExpiredSeen";

export type ResolvedSubscription = {
  /** Raw DB status before expiry normalization */
  rawStatus: SubscriptionStatus;
  /** Effective status after applying trial end */
  status: SubscriptionStatus;
  tier: SubscriptionTier;
  entitlements: PlanEntitlements;
  /** Active signup/Stripe trial window */
  isTrialing: boolean;
  /** Was trialing but trial_ends_at is in the past (needs / just downgraded) */
  isTrialExpired: boolean;
  /** Paid Pro or Heavy (not trial) */
  isPaidPro: boolean;
  isHeavy: boolean;
  isFree: boolean;
  /** Pro entitlements via trial or paid */
  isPro: boolean;
  trialEndsAt: Date | null;
  trialMsRemaining: number;
  trialDaysRemaining: number;
  trialHoursRemaining: number;
  /** Short UI label: Free | Pro Trial | Pro | Pro Heavy | … */
  label: string;
};

type ProfileLike = {
  subscription_status?: string | null;
  trial_ends_at?: string | null;
  stripe_subscription_id?: string | null;
  email?: string | null;
} | null;

function asStatus(raw: string | null | undefined): SubscriptionStatus {
  switch (raw) {
    case "free":
    case "trialing":
    case "pro":
    case "pro_heavy":
    case "active":
    case "past_due":
    case "canceled":
      return raw;
    default:
      return "free";
  }
}

export function parseTrialEndsAt(
  trialEndsAt: string | null | undefined,
): Date | null {
  if (!trialEndsAt) return null;
  const d = new Date(trialEndsAt);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** True when DB says trialing and the clock has run out (and no paid sub id). */
export function isTrialWindowExpired(profile: ProfileLike): boolean {
  if (!profile) return false;
  if (isLongLivedQaTrialEmail(profile.email)) return false;
  const status = asStatus(profile.subscription_status);
  if (status !== "trialing") return false;
  if (profile.stripe_subscription_id) return false;
  const ends = parseTrialEndsAt(profile.trial_ends_at);
  if (!ends) return false;
  return ends.getTime() <= Date.now();
}

export function shouldPersistTrialExpiry(profile: ProfileLike): boolean {
  return isTrialWindowExpired(profile);
}

/**
 * Map profile row → effective tier (trial counts as Pro until expiry).
 */
export function resolveTier(
  status: SubscriptionStatus | string | null | undefined,
  trialEndsAt?: string | null,
  email?: string | null,
): SubscriptionTier {
  const s = asStatus(status ?? "free");
  if (s === "pro_heavy") return "pro_heavy";
  if (s === "pro" || s === "active") return "pro";
  if (s === "trialing") {
    if (isLongLivedQaTrialEmail(email)) return "pro";
    const ends = parseTrialEndsAt(trialEndsAt);
    if (!ends) return "pro";
    return ends.getTime() > Date.now() ? "pro" : "free";
  }
  return "free";
}

export function resolveSubscription(profile: ProfileLike): ResolvedSubscription {
  const rawStatus = asStatus(profile?.subscription_status ?? "free");
  const trialEndsAt = parseTrialEndsAt(profile?.trial_ends_at);
  const trialExpired = isTrialWindowExpired(profile);

  const effectiveStatus: SubscriptionStatus = trialExpired
    ? "free"
    : rawStatus === "active"
      ? "pro"
      : rawStatus;

  const tier = resolveTier(
    trialExpired ? "free" : rawStatus,
    profile?.trial_ends_at,
    profile?.email,
  );

  const holdQaTrial = isLongLivedQaTrialEmail(profile?.email);
  const isTrialing =
    !trialExpired &&
    rawStatus === "trialing" &&
    (holdQaTrial || Boolean(trialEndsAt && trialEndsAt.getTime() > Date.now()));

  const isPaidPro =
    (rawStatus === "pro" || rawStatus === "active" || rawStatus === "pro_heavy") &&
    !isTrialing;

  const trialMsRemaining =
    isTrialing && trialEndsAt
      ? Math.max(0, trialEndsAt.getTime() - Date.now())
      : 0;

  const trialDaysRemaining = Math.ceil(
    trialMsRemaining / (24 * 60 * 60 * 1000),
  );
  const trialHoursRemaining = Math.ceil(trialMsRemaining / (60 * 60 * 1000));

  let label = PLAN_ENTITLEMENTS[tier].label;
  if (isTrialing) label = "Pro Trial";
  else if (rawStatus === "past_due") label = "Past due";
  else if (rawStatus === "canceled" && tier === "free") label = "Free";

  return {
    rawStatus,
    status: effectiveStatus,
    tier,
    entitlements: entitlementsForTier(tier),
    isTrialing,
    isTrialExpired: trialExpired,
    isPaidPro,
    isHeavy: tier === "pro_heavy",
    isFree: tier === "free",
    isPro: tier === "pro" || tier === "pro_heavy",
    trialEndsAt,
    trialMsRemaining,
    trialDaysRemaining,
    trialHoursRemaining,
    label,
  };
}

/** Human countdown for Pricing / banners. */
export function formatTrialCountdown(resolved: ResolvedSubscription): string {
  if (!resolved.isTrialing) return "";
  const ms = resolved.trialMsRemaining;
  if (ms <= 0) return "Trial ended";

  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));

  if (days >= 2) return `${days} days left in your Pro Trial`;
  if (days === 1) return `1 day ${hours}h left in your Pro Trial`;
  if (hours >= 1) return `${hours}h ${minutes}m left in your Pro Trial`;
  return `${Math.max(1, minutes)}m left in your Pro Trial`;
}

export function formatTrialEndDate(resolved: ResolvedSubscription): string {
  if (!resolved.trialEndsAt) return "";
  return formatAppDate(resolved.trialEndsAt);
}

/** One-shot local flag so we can show a friendly upgrade prompt after expiry. */
export function markTrialExpiredPromptPending(trialEndsAt?: string | null): void {
  if (typeof window === "undefined") return;
  try {
    const key = trialEndsAt || "expired";
    if (localStorage.getItem(TRIAL_EXPIRED_SEEN_KEY) === key) return;
    localStorage.setItem(TRIAL_EXPIRED_PROMPT_KEY, key);
  } catch {
    // ignore
  }
}

export function consumeTrialExpiredPrompt(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const pending = localStorage.getItem(TRIAL_EXPIRED_PROMPT_KEY);
    if (!pending) return false;
    localStorage.removeItem(TRIAL_EXPIRED_PROMPT_KEY);
    localStorage.setItem(TRIAL_EXPIRED_SEEN_KEY, pending);
    return true;
  } catch {
    return false;
  }
}

export function profileFromRow(row: Record<string, unknown> | null): Profile | null {
  if (!row || typeof row.id !== "string") return null;
  return {
    id: row.id,
    email: typeof row.email === "string" ? row.email : null,
    subscription_status: asStatus(
      typeof row.subscription_status === "string"
        ? row.subscription_status
        : "free",
    ),
    stripe_customer_id:
      typeof row.stripe_customer_id === "string"
        ? row.stripe_customer_id
        : null,
    stripe_subscription_id:
      typeof row.stripe_subscription_id === "string"
        ? row.stripe_subscription_id
        : null,
    trial_ends_at:
      typeof row.trial_ends_at === "string" ? row.trial_ends_at : null,
    current_period_end:
      typeof row.current_period_end === "string"
        ? row.current_period_end
        : null,
    created_at:
      typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
    updated_at:
      typeof row.updated_at === "string" ? row.updated_at : new Date().toISOString(),
  };
}
