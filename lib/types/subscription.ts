/**
 * Subscription plan catalog — PROJECT.md pricing + entitlements.
 * Stripe Price IDs are wired when env vars are set; UI works before that.
 */

import type { TokenPlan } from "@/lib/types/tokens";
import { TOKEN_PLAN_LIMITS } from "@/lib/types/tokens";

export type SubscriptionStatus =
  | "free"
  | "trialing"
  | "pro"
  | "pro_heavy"
  | "active"
  | "past_due"
  | "canceled";

export type SubscriptionTier = "free" | "pro" | "pro_heavy";

export type BillingInterval = "monthly" | "yearly";

export type PaidPlan = "pro" | "pro_heavy";

/** What to send to /api/stripe/checkout */
export type CheckoutSelection = {
  plan: PaidPlan;
  interval: BillingInterval;
};

/** @deprecated use CheckoutSelection — kept for older call sites */
export type CheckoutPlan = BillingInterval;

export type RagDepth = "basic" | "standard" | "deep";

export type PlanEntitlements = {
  tier: SubscriptionTier;
  label: string;
  /** Display prices (USD) */
  priceMonthly: number;
  priceYearly: number;
  /** Included tokens / month */
  includedTokens: number;
  monthlyHardCap: number | null;
  maxVehicles: number;
  /** Voice input + TTS coaching */
  voiceEnabled: boolean;
  /** Soft daily voice turns for free (0 = locked) */
  voiceDailyLimit: number;
  /**
   * Soft daily photo-diagnose sends.
   * 0 = unlimited (Pro+); Free uses a small daily cap.
   */
  photoDailyLimit: number;
  ragDepth: RagDepth;
  maintenanceHistory: boolean;
  /** Annual vehicle health PDF (Pro+) */
  annualHealthReport: boolean;
  /**
   * Custom vehicle profile tags (Modified, Tow, Classic, …) — Pro+.
   * Free garage still gets system / VCdb tags when applicable.
   */
  customProfileTags: boolean;
  /**
   * Coach playbook starts per 30-day window from registration day.
   * null / 0 = unlimited (Pro+).
   */
  playbookRunsPerMonth: number | null;
  /**
   * Shop handoff reports per UTC calendar month.
   * null = unlimited (paid Pro / Heavy). Active Pro Trial uses
   * {@link TRIAL_SHOP_REPORTS_PER_MONTH} instead of this field.
   */
  shopReportsPerMonth: number | null;
  prioritySupport: boolean;
  highlight?: string;
  features: string[];
};

/** Active signup/Stripe trial shop-report cap (UTC calendar month). */
export const TRIAL_SHOP_REPORTS_PER_MONTH = 30;

export const PLAN_ENTITLEMENTS: Record<SubscriptionTier, PlanEntitlements> = {
  free: {
    tier: "free",
    label: "Free",
    priceMonthly: 0,
    priceYearly: 0,
    includedTokens: TOKEN_PLAN_LIMITS.free.includedMonthly,
    monthlyHardCap: TOKEN_PLAN_LIMITS.free.monthlyHardCap,
    maxVehicles: 1,
    voiceEnabled: false,
    voiceDailyLimit: 0,
    photoDailyLimit: 5,
    ragDepth: "basic",
    maintenanceHistory: false,
    annualHealthReport: false,
    customProfileTags: false,
    playbookRunsPerMonth: 5,
    shopReportsPerMonth: 3,
    prioritySupport: false,
    features: [
      "15k tokens / month",
      "1 vehicle",
      "Dashboard + basic AI chat",
      "5 photo diagnoses / day",
      "5 coach playbook starts / 30 days",
      "3 shop reports / calendar month",
      "Parts inventory (basic)",
      "Text + photo coaching",
      "Quick vehicle snapshot PDF",
    ],
  },
  pro: {
    tier: "pro",
    label: "Pro",
    priceMonthly: 9.99,
    priceYearly: 79,
    includedTokens: TOKEN_PLAN_LIMITS.pro.includedMonthly,
    monthlyHardCap: TOKEN_PLAN_LIMITS.pro.monthlyHardCap,
    maxVehicles: 5,
    voiceEnabled: true,
    voiceDailyLimit: 200,
    photoDailyLimit: 0,
    ragDepth: "standard",
    maintenanceHistory: true,
    annualHealthReport: true,
    customProfileTags: true,
    playbookRunsPerMonth: null,
    shopReportsPerMonth: null,
    prioritySupport: false,
    highlight: "Most popular",
    features: [
      "150k tokens / month (cap 500k)",
      "Up to 5 vehicles",
      "Unlimited photo diagnoses",
      "Unlimited coach playbooks",
      "Unlimited shop reports",
      "Custom profile tags (Modified, Tow, Classic…)",
      "Voice coaching (mic + auto-read)",
      "Standard RAG knowledge depth",
      "Maintenance history",
      "Annual vehicle health report",
      "Token top-ups available",
    ],
  },
  pro_heavy: {
    tier: "pro_heavy",
    label: "Pro Heavy",
    priceMonthly: 19.99,
    priceYearly: 159,
    includedTokens: TOKEN_PLAN_LIMITS.pro_heavy.includedMonthly,
    monthlyHardCap: TOKEN_PLAN_LIMITS.pro_heavy.monthlyHardCap,
    maxVehicles: 10,
    voiceEnabled: true,
    voiceDailyLimit: 1000,
    photoDailyLimit: 0,
    ragDepth: "deep",
    maintenanceHistory: true,
    annualHealthReport: true,
    customProfileTags: true,
    playbookRunsPerMonth: null,
    shopReportsPerMonth: null,
    prioritySupport: true,
    highlight: "For power DIYers",
    features: [
      "400k tokens / month (cap 1M)",
      "Up to 10 vehicles",
      "Unlimited photo diagnoses",
      "Unlimited coach playbooks",
      "Unlimited shop reports",
      "Custom profile tags + deep RAG",
      "Unlimited-feel voice coaching",
      "Annual vehicle health report",
      "Priority support",
      "Best for multi-car households",
    ],
  },
};

export type Profile = {
  id: string;
  email: string | null;
  subscription_status: SubscriptionStatus;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  created_at: string;
  updated_at: string;
};

export function statusToTier(
  status: SubscriptionStatus | string | null | undefined,
  trialEndsAt?: string | null,
): SubscriptionTier {
  if (status === "pro_heavy") return "pro_heavy";
  if (status === "pro" || status === "active") return "pro";
  if (status === "trialing") {
    if (!trialEndsAt) return "pro";
    return new Date(trialEndsAt).getTime() > Date.now() ? "pro" : "free";
  }
  return "free";
}

export function entitlementsForTier(tier: SubscriptionTier): PlanEntitlements {
  return PLAN_ENTITLEMENTS[tier];
}

export function tokenPlanFromTier(tier: SubscriptionTier): TokenPlan {
  return tier;
}

/** LocalStorage key for soft free voice attempt counting (until server metering). */
export const VOICE_DAILY_COUNT_KEY = "garageGenius_voiceDaily";

/** Soft daily photo-diagnose sends (Free tier). */
export const PHOTO_DAILY_COUNT_KEY = "garageGenius_photoDaily";

/** Max photos attached to one garage diagnose turn. */
export const MAX_PHOTO_DIAGNOSE_IMAGES = 4;

/** RAG retrieval match_count by plan depth (wire into /api/chat when RAG is live). */
export function ragMatchLimit(depth: RagDepth): number {
  switch (depth) {
    case "basic":
      return 3;
    case "standard":
      return 5;
    case "deep":
      return 10;
  }
}
