/**
 * Plan AI spend standards — keep COGS under subscription revenue.
 *
 * Paid: AI budget ≈ 30% of monthly list price (Pro $9.99 → $3.00,
 * Heavy $19.99 → $6.50). Yearly ARPU is lower; the same monthly cap
 * is still under ~50% of yearly-equivalent revenue.
 *
 * Free: small acquisition allowance + almost no vision (Kimi is the
 * margin risk). Trial uses Pro limits.
 *
 * Token included quotas (text_soft_cap) stay the chat limiter;
 * vision is a separate monthly call cap.
 */

import type { TokenPlan } from "@/lib/types/tokens";

export type AiPlanLimits = {
  /** UTC-month USD ceiling for DeepSeek + Kimi (hard cap when enabled). */
  aiBudgetUsd: number;
  /** Photo / vision model calls per UTC month. */
  visionCallsPerPeriod: number;
  /** Included text tokens — warning / catalog alignment, not the USD cap. */
  textSoftCap: number;
};

export const PLAN_AI_LIMITS: Record<TokenPlan, AiPlanLimits> = {
  free: {
    aiBudgetUsd: 0.25,
    visionCallsPerPeriod: 3,
    textSoftCap: 15_000,
  },
  pro: {
    aiBudgetUsd: 3.0,
    visionCallsPerPeriod: 30,
    textSoftCap: 150_000,
  },
  pro_heavy: {
    aiBudgetUsd: 6.5,
    visionCallsPerPeriod: 80,
    textSoftCap: 400_000,
  },
};

export function aiPlanLimitsFor(plan: TokenPlan): AiPlanLimits {
  return PLAN_AI_LIMITS[plan];
}

export function visionCallsLabel(count: number): string {
  return `${count} photo ${count === 1 ? "analysis" : "analyses"} / month`;
}
