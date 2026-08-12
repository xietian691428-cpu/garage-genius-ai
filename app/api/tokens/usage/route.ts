import { NextRequest, NextResponse } from "next/server";
import {
  createSupabaseUserClient,
} from "@/lib/supabase-admin";
import { tokenService } from "@/lib/token-service";
import { TOKEN_PLAN_LIMITS } from "@/lib/types/tokens";
import {
  isQaUnlockEnabled,
  qaTokenAvailabilityView,
} from "@/lib/qa-mode";

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

    const { isUnlimitedTokenEmail } = await import("@/lib/test-token-bypass");
    if (isUnlimitedTokenEmail(user.email)) {
      return NextResponse.json({
        ...qaTokenAvailabilityView(true),
        testUnlimitedTokens: true,
      });
    }

    const availability = await tokenService.getAvailableTokens(user.id);
    const used = availability.usage.monthly_tokens_used;
    const limit = availability.includedMonthly;
    const percentage = Math.min(
      Math.floor((used / Math.max(limit, 1)) * 100),
      100,
    );

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
    });
  } catch (err) {
    console.error("[/api/tokens/usage]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load token usage" },
      { status: 500 },
    );
  }
}
