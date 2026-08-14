/**
 * Server-side subscription paywall helpers (API routes + soft cookie).
 */

import type { NextRequest } from "next/server";
import {
  AiAbuseError,
  requireVerifiedAiUser,
} from "@/lib/ai-abuse";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { resolveSubscription } from "@/lib/subscription";
import { isQaUnlockEnabled } from "@/lib/qa-mode";
import type { PlanEntitlements, SubscriptionTier } from "@/lib/types/subscription";
import { entitlementsForTier } from "@/lib/types/subscription";
import type { UpgradeReason } from "@/lib/upgrade-copy";

export class PaywallError extends Error {
  status = 402;
  code = "paywall";
  reason: UpgradeReason;

  constructor(
    message: string,
    code = "paywall",
    reason: UpgradeReason = "generic",
  ) {
    super(message);
    this.name = "PaywallError";
    this.code = code;
    this.reason = reason;
  }
}

export async function resolveUserEntitlements(userId: string): Promise<{
  tier: SubscriptionTier;
  isPro: boolean;
  entitlements: PlanEntitlements;
  createdAt: string | null;
}> {
  if (isQaUnlockEnabled()) {
    const entitlements = entitlementsForTier("pro_heavy");
    return {
      tier: "pro_heavy",
      isPro: true,
      entitlements,
      createdAt: null,
    };
  }

  const admin = createSupabaseAdmin();
  const { data } = await admin
    .from("profiles")
    .select(
      "email, subscription_status, trial_ends_at, stripe_subscription_id, created_at",
    )
    .eq("id", userId)
    .maybeSingle();

  const resolved = resolveSubscription(data);
  return {
    tier: resolved.tier,
    isPro: resolved.isPro,
    entitlements: resolved.entitlements,
    createdAt: (data?.created_at as string | undefined) ?? null,
  };
}

export type GatedEntitlement =
  | "annualHealthReport"
  | "maintenanceHistory"
  | "customProfileTags"
  | "voiceEnabled";

const ENTITLEMENT_REASON: Record<GatedEntitlement, UpgradeReason> = {
  annualHealthReport: "annual",
  maintenanceHistory: "history",
  customProfileTags: "tags",
  voiceEnabled: "voice",
};

/** Require signed-in user with Pro entitlements (trial counts as Pro). */
export async function requireProUser(req: NextRequest): Promise<{
  id: string;
  tier: SubscriptionTier;
  entitlements: PlanEntitlements;
}> {
  const user = await requireVerifiedAiUser(req);
  const { tier, isPro, entitlements } = await resolveUserEntitlements(user.id);
  if (!isPro) {
    throw new PaywallError(
      "This feature isn’t included with the current account.",
      "pro_required",
      "generic",
    );
  }
  return { id: user.id, tier, entitlements };
}

/** Require a specific Pro entitlement flag. */
export async function requireEntitlement(
  req: NextRequest,
  key: GatedEntitlement,
): Promise<{
  id: string;
  tier: SubscriptionTier;
  entitlements: PlanEntitlements;
}> {
  const user = await requireVerifiedAiUser(req);
  const { tier, isPro, entitlements } = await resolveUserEntitlements(user.id);
  const allowed = Boolean(entitlements[key]);
  if (!isPro || !allowed) {
    const reason = ENTITLEMENT_REASON[key];
    throw new PaywallError(
      `This feature requires Pro (${key}).`,
      "pro_required",
      reason,
    );
  }
  return { id: user.id, tier, entitlements };
}

export function paywallResponse(err: unknown): Response | null {
  if (err instanceof PaywallError) {
    return Response.json(
      { error: err.message, code: err.code, reason: err.reason },
      { status: err.status },
    );
  }
  if (err instanceof AiAbuseError) {
    return Response.json(
      { error: err.message, code: err.code },
      { status: err.status },
    );
  }
  return null;
}

/** Soft cookie name — written by client for middleware soft-paywall. */
export const PLAN_COOKIE = "gg_plan";

/**
 * App tabs soft-gated for Free (cookie-based UX; APIs enforce hard gates).
 * History is intentionally NOT listed — Free users get a read-only preview
 * (see FREE_MAINTENANCE_PREVIEW + UpgradeModal in MaintenanceHistory).
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
