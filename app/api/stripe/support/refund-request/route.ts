import { NextRequest, NextResponse } from "next/server";
import { aiAbuseResponse, requireAiUser } from "@/lib/ai-abuse";
import { queueRefundRequest } from "@/lib/stripe-support";
import { isQaUnlockEnabled, qaPaymentDisabledMessage } from "@/lib/qa-mode";

export const runtime = "nodejs";

/**
 * POST — queue a refund for HUMAN review (does NOT call stripe.refunds.create).
 * Body: { invoiceId, verifyEmail, reason?, clientSessionId? }
 */
export async function POST(req: NextRequest) {
  try {
    if (isQaUnlockEnabled()) {
      return NextResponse.json(
        { error: qaPaymentDisabledMessage() },
        { status: 503 },
      );
    }
    const user = await requireAiUser(req);
    const body = (await req.json()) as {
      invoiceId?: string;
      verifyEmail?: string;
      reason?: string;
      clientSessionId?: string;
    };

    const invoiceId = body.invoiceId?.trim();
    const verifyEmail = body.verifyEmail?.trim();
    if (!invoiceId || !verifyEmail) {
      return NextResponse.json(
        { error: "invoiceId and verifyEmail required" },
        { status: 400 },
      );
    }

    const accountEmail = user.email;
    if (!accountEmail) {
      return NextResponse.json(
        { error: "Account email missing — cannot verify" },
        { status: 400 },
      );
    }

    const { requestId } = await queueRefundRequest({
      userId: user.id,
      email: accountEmail,
      verifyEmail,
      invoiceId,
      reason: body.reason,
      clientSessionId: body.clientSessionId,
    });

    return NextResponse.json({
      ok: true,
      requestId,
      status: "pending_human",
      message:
        "Refund queued for human review. No money has been moved yet.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Refund queue failed";
    const status = /verification failed/i.test(message) ? 403 : 500;
    return (
      aiAbuseResponse(err) ||
      NextResponse.json({ error: message }, { status })
    );
  }
}
