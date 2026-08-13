/**
 * Token billing service — PROJECT.md「收费与 Token 策略」
 *
 * Server-side only (uses service role). Call from API routes / Server Actions.
 * Do not import this into client components.
 */

import { createSupabaseAdmin } from "@/lib/supabase-admin";
import type { SubscriptionStatus } from "@/lib/types/subscription";
import { resolveTier } from "@/lib/subscription";
import {
  isQaUnlockEnabled,
  qaTokenAvailability,
  qaTokenPlan,
} from "@/lib/qa-mode";
import { isUnlimitedTokenUser } from "@/lib/test-token-bypass";
import {
  TOKEN_PLAN_LIMITS,
  type TokenAvailability,
  type TokenPlan,
  type UserTokenUsage,
} from "@/lib/types/tokens";

function emptyUsage(userId: string): UserTokenUsage {
  return {
    user_id: userId,
    total_tokens_used: 0,
    monthly_tokens_used: 0,
    bonus_tokens_remaining: 0,
    monthly_reset_date: new Date().toISOString(),
  };
}

/** True when `monthly_reset_date` is in a previous UTC calendar month. */
export function needsUtcMonthReset(
  resetDateIso: string,
  now = new Date(),
): boolean {
  const resetAt = new Date(resetDateIso);
  if (Number.isNaN(resetAt.getTime())) return true;
  return (
    resetAt.getUTCFullYear() !== now.getUTCFullYear() ||
    resetAt.getUTCMonth() !== now.getUTCMonth()
  );
}

/**
 * Map profiles.subscription_status (+ trial end) → token plan.
 */
export function planFromSubscriptionStatus(
  status: SubscriptionStatus | string | null | undefined,
  trialEndsAt?: string | null,
  email?: string | null,
): TokenPlan {
  return resolveTier(status, trialEndsAt, email);
}

function computeAvailability(
  plan: TokenPlan,
  usage: UserTokenUsage,
): TokenAvailability {
  const limits = TOKEN_PLAN_LIMITS[plan];
  const resetNeeded = needsUtcMonthReset(usage.monthly_reset_date);
  const monthlyUsed = resetNeeded ? 0 : usage.monthly_tokens_used;
  const bonusRemaining = Math.max(0, usage.bonus_tokens_remaining);
  const includedRemaining = Math.max(0, limits.includedMonthly - monthlyUsed);

  const hardCap = limits.monthlyHardCap;
  const roomUnderCap =
    hardCap == null ? Number.POSITIVE_INFINITY : Math.max(0, hardCap - monthlyUsed);

  // Can spend included first, then bonus — but never past hard cap this month
  const remainingThisMonth = Math.min(
    includedRemaining + bonusRemaining,
    roomUnderCap,
  );

  return {
    plan,
    usage: {
      ...usage,
      monthly_tokens_used: monthlyUsed,
    },
    includedMonthly: limits.includedMonthly,
    monthlyHardCap: hardCap,
    includedRemaining,
    bonusRemaining,
    remainingThisMonth,
    needsMonthlyReset: resetNeeded,
  };
}

export const tokenService = {
  /** Resolve plan from profiles row (defaults to free). */
  async getUserPlan(userId: string): Promise<TokenPlan> {
    if (isQaUnlockEnabled()) return qaTokenPlan();

    const admin = createSupabaseAdmin();
    const { data } = await admin
      .from("profiles")
      .select("email, subscription_status, trial_ends_at")
      .eq("id", userId)
      .maybeSingle();

    return planFromSubscriptionStatus(
      data?.subscription_status,
      data?.trial_ends_at,
      data?.email,
    );
  },

  /** Ensure a usage row exists; return it. */
  async ensureUsageRow(userId: string): Promise<UserTokenUsage> {
    const admin = createSupabaseAdmin();
    const { data, error } = await admin
      .from("user_token_usage")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw error;
    if (data) return data as UserTokenUsage;

    const { data: created, error: insertError } = await admin
      .from("user_token_usage")
      .upsert(
        {
          user_id: userId,
          total_tokens_used: 0,
          monthly_tokens_used: 0,
          bonus_tokens_remaining: 0,
          monthly_reset_date: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      )
      .select("*")
      .single();

    if (insertError) throw insertError;
    return (created as UserTokenUsage) ?? emptyUsage(userId);
  },

  /**
   * Get usage + remaining budget for this user/plan.
   * Applies a UTC calendar-month reset when monthly_reset_date is in a prior month.
   */
  async getAvailableTokens(
    userId: string,
    email?: string | null,
  ): Promise<TokenAvailability> {
    if (isQaUnlockEnabled()) return qaTokenAvailability(userId);
    if (await isUnlimitedTokenUser(userId, email)) {
      return qaTokenAvailability(userId);
    }

    const [plan, usage] = await Promise.all([
      this.getUserPlan(userId),
      this.ensureUsageRow(userId),
    ]);

    let working = usage;
    if (needsUtcMonthReset(usage.monthly_reset_date)) {
      working = await this.resetMonthlyUsage(userId);
    }

    return computeAvailability(plan, working);
  },

  /** Roll monthly counter (keeps lifetime total_tokens_used). */
  async resetMonthlyUsage(userId: string): Promise<UserTokenUsage> {
    const admin = createSupabaseAdmin();
    const { data, error } = await admin
      .from("user_token_usage")
      .update({
        monthly_tokens_used: 0,
        monthly_reset_date: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .select("*")
      .single();

    if (error) throw error;
    return data as UserTokenUsage;
  },

  /**
   * Check whether the user can spend `requiredTokens` this month
   * (included quota + bonus, under hard cap).
   */
  async hasEnoughTokens(
    userId: string,
    requiredTokens: number = 1000,
    email?: string | null,
  ): Promise<boolean> {
    if (isQaUnlockEnabled()) return true;
    if (await isUnlimitedTokenUser(userId, email)) return true;
    if (requiredTokens <= 0) return true;
    const availability = await this.getAvailableTokens(userId, email);
    return availability.remainingThisMonth >= requiredTokens;
  },

  /**
   * Consume tokens after (or before) an AI call.
   * Order: included monthly quota → bonus top-ups.
   * Enforces plan hard caps from PROJECT.md.
   */
  async consumeTokens(
    userId: string,
    tokens: number,
    email?: string | null,
  ): Promise<TokenAvailability> {
    if (isQaUnlockEnabled()) return qaTokenAvailability(userId);
    if (await isUnlimitedTokenUser(userId, email)) {
      return qaTokenAvailability(userId);
    }
    if (!Number.isFinite(tokens) || tokens <= 0) {
      return this.getAvailableTokens(userId, email);
    }

    const rounded = Math.ceil(tokens);
    const availability = await this.getAvailableTokens(userId, email);

    if (availability.remainingThisMonth < rounded) {
      throw new Error(
        `Insufficient tokens. Remaining this month: ${availability.remainingThisMonth}. Plan: ${availability.plan}.`,
      );
    }

    const fromIncluded = Math.min(availability.includedRemaining, rounded);
    const fromBonus = rounded - fromIncluded;

    const nextMonthly = availability.usage.monthly_tokens_used + rounded;
    const nextBonus = Math.max(
      0,
      availability.usage.bonus_tokens_remaining - fromBonus,
    );
    const nextTotal = availability.usage.total_tokens_used + rounded;

    const admin = createSupabaseAdmin();
    const { data, error } = await admin
      .from("user_token_usage")
      .upsert(
        {
          user_id: userId,
          total_tokens_used: nextTotal,
          monthly_tokens_used: nextMonthly,
          bonus_tokens_remaining: nextBonus,
          monthly_reset_date: availability.usage.monthly_reset_date,
          last_updated: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      )
      .select("*")
      .single();

    if (error) throw error;

    return computeAvailability(
      availability.plan,
      data as UserTokenUsage,
    );
  },

  /**
   * Credit purchased top-up tokens (after Stripe payment).
   * Also writes token_purchases ledger row.
   */
  async addBonusTokens(
    userId: string,
    tokensAdded: number,
    amountUsd: number,
    stripePaymentIntentId?: string,
  ): Promise<UserTokenUsage> {
    if (tokensAdded <= 0) {
      throw new Error("tokensAdded must be positive");
    }

    await this.ensureUsageRow(userId);
    const availability = await this.getAvailableTokens(userId);
    const nextBonus =
      availability.usage.bonus_tokens_remaining + Math.ceil(tokensAdded);

    const admin = createSupabaseAdmin();

    const { error: purchaseError } = await admin.from("token_purchases").insert({
      user_id: userId,
      amount_usd: amountUsd,
      tokens_added: Math.ceil(tokensAdded),
      stripe_payment_intent_id: stripePaymentIntentId ?? null,
    });
    if (purchaseError) throw purchaseError;

    const { data, error } = await admin
      .from("user_token_usage")
      .update({
        bonus_tokens_remaining: nextBonus,
        last_updated: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .select("*")
      .single();

    if (error) throw error;
    return data as UserTokenUsage;
  },
};
