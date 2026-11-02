/**
 * Edge-safe soft paywall helpers for middleware.
 * Keep this file free of Node-only imports (crypto, supabase-admin, ai-abuse).
 */

import type { UpgradeReason } from "@/lib/upgrade-copy";
import type { SubscriptionTier } from "@/lib/types/subscription";

/** Soft cookie name — written by client for middleware soft-paywall. */
export const PLAN_COOKIE = "gg_plan";

/**
 * App tabs soft-gated for Free (cookie-based UX; APIs enforce hard gates).
 * History is intentionally NOT listed — Free users get a read-only preview.
 */
export const SOFT_GATED_APP_TABS: Record<string, UpgradeReason> = {};

export function isProPlanCookie(value: string | undefined | null): boolean {
  const plan = value || "free";
  return (
    plan === "pro" ||
    plan === "pro_heavy" ||
    plan === "trialing" ||
    plan === "active"
  );
}

export function planCookieValue(tier: SubscriptionTier | "free"): string {
  return tier;
}

export function pricingUrlForReason(reason: UpgradeReason): string {
  return `/pricing?from=${encodeURIComponent(reason)}`;
}
