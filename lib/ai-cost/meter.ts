/**
 * Pre-call USD + vision quota. Post-call cost is stamped in logTokenUsage.
 * Server-only (service role).
 */

import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { tokenService } from "@/lib/token-service";
import { isQaUnlockEnabled } from "@/lib/qa-mode";
import {
  isUnlimitedTokenUser,
  shouldBypassAiMetering,
} from "@/lib/test-token-bypass";
import { isAiCostHardCapEnabled } from "@/lib/ai-cost/config";
import { PLAN_AI_LIMITS } from "@/lib/ai-cost/plan-limits";
import { countsAsVisionCall } from "@/lib/ai-cost/gate";
import { utcMonthBounds } from "@/lib/ai-cost/period";
import type { TokenPlan } from "@/lib/types/tokens";

export type AiSpendSnapshot = {
  plan: TokenPlan;
  periodStartIso: string;
  periodEndIso: string;
  spentUsd: number;
  budgetUsd: number;
  spendRemainingUsd: number;
  visionUsed: number;
  visionLimit: number;
  visionRemaining: number;
  hardCapEnabled: boolean;
};

const EMPTY_EVENTS_ERROR =
  /token_usage_events|column .*provider|does not exist|schema cache/i;

export async function getAiSpendSnapshot(
  userId: string,
  email?: string | null,
): Promise<AiSpendSnapshot> {
  const plan = await tokenService.getUserPlan(userId);
  const limits = PLAN_AI_LIMITS[plan];
  const bounds = utcMonthBounds();
  const hardCapEnabled = isAiCostHardCapEnabled();

  const unlimited =
    shouldBypassAiMetering({ email, qaUnlock: isQaUnlockEnabled() }) ||
    (await isUnlimitedTokenUser(userId, email));

  if (unlimited) {
    return {
      plan,
      periodStartIso: bounds.startIso,
      periodEndIso: bounds.endIso,
      spentUsd: 0,
      budgetUsd: limits.aiBudgetUsd,
      spendRemainingUsd: limits.aiBudgetUsd,
      visionUsed: 0,
      visionLimit: limits.visionCallsPerPeriod,
      visionRemaining: limits.visionCallsPerPeriod,
      hardCapEnabled,
    };
  }

  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("token_usage_events")
    .select("cost_usd, provider, route")
    .eq("user_id", userId)
    .gte("created_at", bounds.startIso)
    .lt("created_at", bounds.endIso)
    .limit(20_000);

  if (error) {
    if (EMPTY_EVENTS_ERROR.test(error.message)) {
      console.warn(
        "[ai-cost] usage query unavailable — apply migration 053_ai_cost_loop.sql",
        error.message,
      );
      return snapshotFromTotals(plan, bounds, 0, 0, hardCapEnabled);
    }
    throw Object.assign(
      new Error(
        "Could not verify AI usage allowance. Please try again in a moment.",
      ),
      { status: 503, code: "ai_spend_unavailable" as const },
    );
  }

  let spentUsd = 0;
  let visionUsed = 0;
  for (const row of data || []) {
    spentUsd += Number((row as { cost_usd?: number | string }).cost_usd) || 0;
    if (
      countsAsVisionCall({
        provider: (row as { provider?: string | null }).provider,
        route: (row as { route?: string | null }).route,
      })
    ) {
      visionUsed += 1;
    }
  }

  return snapshotFromTotals(plan, bounds, spentUsd, visionUsed, hardCapEnabled);
}

function snapshotFromTotals(
  plan: TokenPlan,
  bounds: { startIso: string; endIso: string },
  spentUsd: number,
  visionUsed: number,
  hardCapEnabled: boolean,
): AiSpendSnapshot {
  const limits = PLAN_AI_LIMITS[plan];
  const spent = Math.round(Math.max(0, spentUsd) * 1_000_000) / 1_000_000;
  return {
    plan,
    periodStartIso: bounds.startIso,
    periodEndIso: bounds.endIso,
    spentUsd: spent,
    budgetUsd: limits.aiBudgetUsd,
    spendRemainingUsd: Math.max(0, Math.round((limits.aiBudgetUsd - spent) * 1_000_000) / 1_000_000),
    visionUsed,
    visionLimit: limits.visionCallsPerPeriod,
    visionRemaining: Math.max(0, limits.visionCallsPerPeriod - visionUsed),
    hardCapEnabled,
  };
}

