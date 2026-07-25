import { NextRequest, NextResponse } from "next/server";
import { aiAbuseResponse, requireAiUser } from "@/lib/ai-abuse";
import {
  getSupportBillingStatus,
  resendSupportInvoice,
} from "@/lib/stripe-support";
import { isQaUnlockEnabled, qaPaymentDisabledMessage } from "@/lib/qa-mode";

export const runtime = "nodejs";

/** POST — resend or return hosted invoice URL. Body: { invoiceId } */
export async function POST(req: NextRequest) {
  try {
    if (isQaUnlockEnabled()) {
      return NextResponse.json(
        { error: qaPaymentDisabledMessage() },
        { status: 503 },
      );
    }
    const user = await requireAiUser(req);
    const body = (await req.json()) as { invoiceId?: string };
    const invoiceId = body.invoiceId?.trim();
    if (!invoiceId) {
      return NextResponse.json({ error: "invoiceId required" }, { status: 400 });
    }

    const status = await getSupportBillingStatus(user.id);
    if (!status.customerId) {
      return NextResponse.json(
        { error: "No Stripe customer on file" },
        { status: 400 },
      );
    }

    const result = await resendSupportInvoice({
      customerId: status.customerId,
      invoiceId,
    });

    return NextResponse.json({
      ok: true,
      mode: result.mode,
      url: result.url,
    });
  } catch (err) {
    return (
      aiAbuseResponse(err) ||
      NextResponse.json(
        { error: err instanceof Error ? err.message : "Invoice failed" },
        { status: 500 },
      )
    );
  }
}
