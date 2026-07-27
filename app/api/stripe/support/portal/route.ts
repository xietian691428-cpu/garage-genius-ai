import { NextRequest, NextResponse } from "next/server";
import { aiAbuseResponse, requireAiUser } from "@/lib/ai-abuse";
import {
  createSupportPortalSession,
  getSupportBillingStatus,
  type PortalFlow,
} from "@/lib/stripe-support";
import { isQaUnlockEnabled, qaPaymentDisabledMessage } from "@/lib/qa-mode";
import { getAppBaseUrl } from "@/lib/app-url";

export const runtime = "nodejs";

function appBaseUrl(req: NextRequest): string {
  return getAppBaseUrl(req.nextUrl.origin);
}

/**
 * POST — open Stripe Customer Portal (optional deep-link flow).
 * Body: { flow?: "default" | "payment_method_update" | "subscription_cancel" }
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
    let flow: PortalFlow = "default";
    try {
      const body = (await req.json()) as { flow?: PortalFlow };
      if (
        body.flow === "payment_method_update" ||
        body.flow === "subscription_cancel" ||
        body.flow === "default"
      ) {
        flow = body.flow;
      }
    } catch {
      /* empty */
    }

    const status = await getSupportBillingStatus(user.id);
    if (!status.customerId) {
      return NextResponse.json(
        { error: "No Stripe customer on file. Subscribe first." },
        { status: 400 },
      );
    }

    if (flow === "subscription_cancel" && !status.subscriptionId) {
      return NextResponse.json(
        { error: "No active subscription to cancel." },
        { status: 400 },
      );
    }

    const url = await createSupportPortalSession({
      customerId: status.customerId,
      returnUrl: `${appBaseUrl(req)}/app?tab=settings&billing=support`,
      flow,
      subscriptionId: status.subscriptionId,
    });

    return NextResponse.json({ ok: true, url });
  } catch (err) {
    return (
      aiAbuseResponse(err) ||
      NextResponse.json(
        { error: err instanceof Error ? err.message : "Portal failed" },
        { status: 500 },
      )
    );
  }
}
