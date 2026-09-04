/**
 * Token billing types — PROJECT.md「收费与 Token 策略」
 *
 * Free: 15k / month · 3 photo analyses
 * Pro: $9.99 / 150k included, monthly hard cap 500k · 30 photos
 * Pro Heavy: $19.99 / 400k included, monthly hard cap 1M · 80 photos
 * AI USD budgets: Free $0.25 · Pro $3.00 · Heavy $6.50 (see lib/ai-cost/plan-limits.ts)
 * Top-up: ~$0.07–$0.08 per 1k tokens (stored as bonus_tokens_remaining)
 */

export type TokenPlan = "free" | "pro" | "pro_heavy";

export type UserTokenUsage = {
  id?: string;
  user_id: string;
  total_tokens_used: number;
  monthly_tokens_used: number;
  bonus_tokens_remaining: number;
  monthly_reset_date: string;
  last_updated?: string;
  created_at?: string;
};

export type TokenPlanLimits = {
  /** Included tokens per calendar/billing month */
  includedMonthly: number;
  /**
   * Hard monthly ceiling (included + top-ups consumed this month).
   * Free has no separate hard cap beyond included.
   */
  monthlyHardCap: number | null;
};

/** Strict quotas from PROJECT.md — adjust only when costs change. */
export const TOKEN_PLAN_LIMITS: Record<TokenPlan, TokenPlanLimits> = {
  free: {
    includedMonthly: 15_000,
    // null = included quota only; purchased bonus tokens remain usable after Free included runs out
    monthlyHardCap: null,
  },
  pro: {
    includedMonthly: 150_000,
    monthlyHardCap: 500_000,
  },
  pro_heavy: {
    includedMonthly: 400_000,
    monthlyHardCap: 1_000_000,
  },
};

/** Top-up pricing band (USD per 1k tokens). Exact rate set at checkout. */
export const TOKEN_TOPUP_USD_PER_1K = {
  min: 0.07,
  max: 0.08,
  default: 0.075,
} as const;

/** One-time token packs shown on /recharge (volume pricing within ~$0.06–$0.08 / 1k). */
export const TOKEN_RECHARGE_PACKS = [
  {
    id: "pack_80k",
    tokens: 80_000,
    priceUsd: 5,
    label: "80K Tokens",
    description: "Light top-up for a few more diagnoses",
  },
  {
    id: "pack_170k",
    tokens: 170_000,
    priceUsd: 10,
    label: "170K Tokens",
    description: "Best for regular DIY weeks",
  },
  {
    id: "pack_350k",
    tokens: 350_000,
    priceUsd: 20,
    label: "350K Tokens",
    description: "For heavy users mid-repair season",
  },
] as const;

export type TokenRechargePackId = (typeof TOKEN_RECHARGE_PACKS)[number]["id"];

export function findRechargePack(
  tokens: number,
  priceUsd: number,
): (typeof TOKEN_RECHARGE_PACKS)[number] | undefined {
  return TOKEN_RECHARGE_PACKS.find(
    (p) => p.tokens === tokens && p.priceUsd === priceUsd,
  );
}

export function tokenPercentUsed(used: number, includedMonthly: number): number {
  return Math.min(100, Math.floor((used / Math.max(includedMonthly, 1)) * 100));
}

export function tokenPercentLeft(input: {
  unlimited?: boolean;
  used: number;
  includedMonthly: number;
}): number {
  if (input.unlimited) return 100;
  return Math.max(0, 100 - tokenPercentUsed(input.used, input.includedMonthly));
}

export type TokenAvailability = {
  plan: TokenPlan;
  usage: UserTokenUsage;
  includedMonthly: number;
  monthlyHardCap: number | null;
  /** Tokens still available from this month's included quota */
  includedRemaining: number;
  /** Purchased top-up tokens still available */
  bonusRemaining: number;
  /**
   * How many more tokens can be used this month before hard cap
   * (includes bonus, but never exceeds hard cap).
   */
  remainingThisMonth: number;
  needsMonthlyReset: boolean;
};
