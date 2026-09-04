import { NextRequest, NextResponse } from "next/server";
import {
  createSupabaseUserClient,
} from "@/lib/supabase-admin";
import { tokenService } from "@/lib/token-service";
import { TOKEN_PLAN_LIMITS, tokenPercentUsed } from "@/lib/types/tokens";
import {
  isQaUnlockEnabled,
  qaTokenAvailabilityView,
} from "@/lib/qa-mode";
import { isUnlimitedTokenUser } from "@/lib/test-token-bypass";
import { PLAN_AI_LIMITS } from "@/lib/ai-cost/plan-limits";
import { getAiSpendSnapshot } from "@/lib/ai-cost/meter";
import { isAiCostHardCapEnabled } from "@/lib/ai-cost/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getAccessToken(req: NextRequest): string | null {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim() || null;
}

/** GET /api/tokens/usage — monthly token budget for the signed-in user. */
export async function GET(req: NextRequest) {
  try {
    const token = getAccessToken(req);

    if (!token) {
      // Guest / not signed in — show Free plan defaults (no server tracking yet)
      const free = TOKEN_PLAN_LIMITS.free;
      const ai = PLAN_AI_LIMITS.free;
      return NextResponse.json({
        signedIn: false,
        plan: "free",
        used: 0,
        limit: free.includedMonthly,
        includedMonthly: free.includedMonthly,
        monthlyHardCap: free.monthlyHardCap,
        includedRemaining: free.includedMonthly,
        bonusRemaining: 0,
        remainingThisMonth: free.includedMonthly,
        percentage: 0,
        percentLeft: 100,
        unlimited: false,
        visionUsed: 0,
        visionLimit: ai.visionCallsPerPeriod,
        visionRemaining: ai.visionCallsPerPeriod,
        aiSpendUsd: 0,
        aiBudgetUsd: ai.aiBudgetUsd,
        spendRemainingUsd: ai.aiBudgetUsd,
        hardCapEnabled: isAiCostHardCapEnabled(),
      });
    }

    const userClient = createSupabaseUserClient(token);
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (isQaUnlockEnabled()) {
      return NextResponse.json(qaTokenAvailabilityView(true));
    }

    if (await isUnlimitedTokenUser(user.id, user.email)) {
      return NextResponse.json({
        ...qaTokenAvailabilityView(true),
        testUnlimitedTokens: true,
        unlimited: true,
        percentLeft: 100,
      });
    }

    const availability = await tokenService.getAvailableTokens(
      user.id,
      user.email,
    );
    const used = availability.usage.monthly_tokens_used;
    const limit = availability.includedMonthly;
    const percentage = tokenPercentUsed(used, limit);

    let spend = {
      visionUsed: 0,
      visionLimit: PLAN_AI_LIMITS[availability.plan].visionCallsPerPeriod,
      visionRemaining: PLAN_AI_LIMITS[availability.plan].visionCallsPerPeriod,
      aiSpendUsd: 0,
      aiBudgetUsd: PLAN_AI_LIMITS[availability.plan].aiBudgetUsd,
      spendRemainingUsd: PLAN_AI_LIMITS[availability.plan].aiBudgetUsd,
      hardCapEnabled: isAiCostHardCapEnabled(),
    };
    try {
      const snap = await getAiSpendSnapshot(user.id, user.email);
      spend = {
        visionUsed: snap.visionUsed,
        visionLimit: snap.visionLimit,
        visionRemaining: snap.hardCapEnabled
          ? snap.visionRemaining
          : snap.visionLimit,
        aiSpendUsd: snap.spentUsd,
        aiBudgetUsd: snap.budgetUsd,
        spendRemainingUsd: snap.hardCapEnabled
          ? snap.spendRemainingUsd
          : snap.budgetUsd,
        hardCapEnabled: snap.hardCapEnabled,
      };
    } catch (err) {
      console.warn(
        "[/api/tokens/usage] spend snapshot",
        err instanceof Error ? err.message : err,
      );
    }

    return NextResponse.json({
      signedIn: true,
      plan: availability.plan,
      used,
      limit,
      includedMonthly: availability.includedMonthly,
      monthlyHardCap: availability.monthlyHardCap,
      includedRemaining: availability.includedRemaining,
      bonusRemaining: availability.bonusRemaining,
      remainingThisMonth: availability.remainingThisMonth,
      percentage,
      percentLeft: Math.max(0, 100 - percentage),
      unlimited: false,
      ...spend,
    });
  } catch (err) {
    console.error("[/api/tokens/usage]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load token usage" },
      { status: 500 },
    );
  }
}
