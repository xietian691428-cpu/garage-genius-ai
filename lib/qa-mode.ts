/**
 * QA / beta unlock — open all Pro Heavy entitlements without Stripe.
 *
 * Enable only on local / Preview for tester rounds:
 *   NEXT_PUBLIC_QA_UNLOCK=true
 *
 * Hard-blocked on Vercel Production builds even if the env var is mis-set.
 * Disable for production launch (remove var or set false, redeploy).
 */

import type { ResolvedSubscription } from "@/lib/subscription";
import {
  PLAN_ENTITLEMENTS,
  type PlanEntitlements,
} from "@/lib/types/subscription";
import type { TokenAvailability, TokenPlan } from "@/lib/types/tokens";
import { TOKEN_PLAN_LIMITS } from "@/lib/types/tokens";

export const QA_UNLOCK_ENV = "NEXT_PUBLIC_QA_UNLOCK";

function isVercelProduction(): boolean {
  return process.env.VERCEL_ENV === "production";
}

export function isQaUnlockEnabled(): boolean {
  // Never unlock paid entitlements on production deploys.
  if (isVercelProduction()) return false;

  const raw =
    process.env.NEXT_PUBLIC_QA_UNLOCK?.trim() ??
    process.env.QA_UNLOCK?.trim() ??
    "";
  return raw === "1" || raw === "true" || raw === "yes";
}

export const QA_ENTITLEMENTS: PlanEntitlements = PLAN_ENTITLEMENTS.pro_heavy;

/** Shown when checkout/recharge is blocked during QA. */
export function qaPaymentDisabledMessage(): string {
  return "Payments are disabled during the QA test period. All features are already unlocked — no purchase needed.";
}

/**
 * Override subscription resolution → Pro Heavy for every signed-in user.
 */
export function applyQaUnlock(resolved: ResolvedSubscription): ResolvedSubscription {
  if (!isQaUnlockEnabled()) return resolved;

  return {
    ...resolved,
    status: "pro_heavy",
    tier: "pro_heavy",
    entitlements: QA_ENTITLEMENTS,
    isTrialing: false,
    isTrialExpired: false,
    isPaidPro: false,
    isHeavy: true,
    isFree: false,
    isPro: true,
    label: "QA Test — Full Access",
    trialMsRemaining: 0,
    trialDaysRemaining: 0,
    trialHoursRemaining: 0,
  };
}

export function qaTokenPlan(): TokenPlan {
  return "pro_heavy";
}

/** Generous budget so UI never blocks; server skips real deduction in QA. */
export function qaTokenAvailabilityView(signedIn: boolean) {
  const limits = TOKEN_PLAN_LIMITS.pro_heavy;
  return {
    signedIn,
    plan: "pro_heavy" as TokenPlan,
    used: 0,
    limit: limits.includedMonthly,
    includedMonthly: limits.includedMonthly,
    monthlyHardCap: limits.monthlyHardCap,
    includedRemaining: limits.includedMonthly,
    bonusRemaining: 9_999_999,
    remainingThisMonth: 9_999_999,
    percentage: 0,
    qaUnlock: true,
  };
}

export function qaTokenAvailability(userId: string): TokenAvailability {
  const limits = TOKEN_PLAN_LIMITS.pro_heavy;
  return {
    plan: "pro_heavy",
    usage: {
      user_id: userId,
      total_tokens_used: 0,
      monthly_tokens_used: 0,
      bonus_tokens_remaining: 9_999_999,
      monthly_reset_date: new Date().toISOString(),
    },
    includedMonthly: limits.includedMonthly,
    monthlyHardCap: limits.monthlyHardCap,
    includedRemaining: limits.includedMonthly,
    bonusRemaining: 9_999_999,
    remainingThisMonth: 9_999_999,
    needsMonthlyReset: false,
  };
}
