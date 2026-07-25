import { NextRequest, NextResponse } from "next/server";
import { aiAbuseResponse, requireAiUser } from "@/lib/ai-abuse";
import { getSupportBillingStatus } from "@/lib/stripe-support";
import { isQaUnlockEnabled, qaPaymentDisabledMessage } from "@/lib/qa-mode";

export const runtime = "nodejs";

/** GET — current Stripe subscription + recent invoices for support coach */
export async function GET(req: NextRequest) {
  try {
    if (isQaUnlockEnabled()) {
      return NextResponse.json(
        { error: qaPaymentDisabledMessage() },
        { status: 503 },
      );
    }
    const user = await requireAiUser(req);
    const status = await getSupportBillingStatus(user.id);
    return NextResponse.json({ ok: true, status });
  } catch (err) {
    return (
      aiAbuseResponse(err) ||
      NextResponse.json(
        { error: err instanceof Error ? err.message : "Status failed" },
        { status: 500 },
      )
    );
  }
}
