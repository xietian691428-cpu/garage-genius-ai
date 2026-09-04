/**
 * Pure spend/vision gate — unit-tested without Supabase.
 */

import { PLAN_AI_LIMITS } from "@/lib/ai-cost/plan-limits";
import type { TokenPlan } from "@/lib/types/tokens";

export type AiSpendGateDecision =
  | { ok: true }
  | {
      ok: false;
      status: 402 | 429;
      code: "ai_budget_exceeded" | "vision_quota_exceeded";
      message: string;
      limited: true;
      remaining: 0;
      used: number;
      limit: number;
    };

export function evaluateAiSpendGate(input: {
  plan: TokenPlan;
  spentUsd: number;
  visionUsed: number;
  needsVision: boolean;
}): AiSpendGateDecision {
  const limits = PLAN_AI_LIMITS[input.plan];
  const spent = Math.max(0, input.spentUsd);
  const visionUsed = Math.max(0, Math.floor(input.visionUsed));

  if (input.needsVision && visionUsed >= limits.visionCallsPerPeriod) {
    return {
      ok: false,
      status: 429,
      code: "vision_quota_exceeded",
      message: visionQuotaMessage(input.plan, limits.visionCallsPerPeriod),
      limited: true,
      remaining: 0,
      used: visionUsed,
      limit: limits.visionCallsPerPeriod,
    };
  }

  if (spent >= limits.aiBudgetUsd) {
    return {
      ok: false,
      status: 402,
      code: "ai_budget_exceeded",
      message: budgetExceededMessage(input.plan, limits.aiBudgetUsd),
      limited: true,
      remaining: 0,
      used: spent,
      limit: limits.aiBudgetUsd,
    };
  }

  return { ok: true };
}

export function countsAsVisionCall(row: {
  provider?: string | null;
  route?: string | null;
}): boolean {
  const provider = (row.provider || "").toLowerCase();
  if (provider === "kimi") return true;
  return row.route === "vision";
}

export function visionQuotaMessage(plan: TokenPlan, limit: number): string {
  if (plan === "free") {
    return `You've used this month's ${limit} photo analyses on Free. Upgrade to Pro for 30 photo analyses / month.`;
  }
  if (plan === "pro") {
    return `You've used this month's ${limit} photo analyses on Pro. Upgrade to Pro Heavy for 80 photo analyses / month.`;
  }
  return `You've used this month's ${limit} photo analyses on Pro Heavy. Try again next month.`;
}

export function budgetExceededMessage(plan: TokenPlan, budgetUsd: number): string {
  const budget = `$${budgetUsd.toFixed(2)}`;
  if (plan === "free") {
    return `This month's AI allowance (${budget} on Free) is used up. Upgrade to Pro for a larger AI budget and 30 photo analyses / month.`;
  }
  if (plan === "pro") {
    return `This month's AI allowance (${budget} on Pro) is used up. Upgrade to Pro Heavy for a larger AI budget, or wait until next month.`;
  }
  return `This month's AI allowance (${budget} on Pro Heavy) is used up. Try again next month.`;
}

export const LIMITED_QUOTA_PREFIX = "[LIMITED / quota exceeded]";

/** Any leftover short text after a hard cap must not look like a full coach reply. */
export function formatLimitedQuotaReply(reason: string): string {
  const body = (reason || "").trim();
  if (body.toLowerCase().includes("limited") && /quota exceeded/i.test(body)) {
    return body;
  }
  return `${LIMITED_QUOTA_PREFIX} ${body || "This month's AI allowance is used up."} This is not a full coaching reply.`;
}

/** After a failed spend gate, DeepSeek/Kimi must not be called. */
export function allowModelCalls(decision: AiSpendGateDecision): boolean {
  return decision.ok;
}
