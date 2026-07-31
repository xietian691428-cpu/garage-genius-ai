import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import {
  createSupabaseAdmin,
  createSupabaseUserClient,
} from "@/lib/supabase-admin";
import {
  isQaUnlockEnabled,
  qaPaymentDisabledMessage,
} from "@/lib/qa-mode";
import { getAppBaseUrl } from "@/lib/app-url";
import {
  BILLING_PORTAL_UNAVAILABLE,
  toUserFacingBillingError,
} from "@/lib/billing-errors";

export const runtime = "nodejs";

function getAccessToken(req: NextRequest): string | null {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim() || null;
}

function appBaseUrl(req: NextRequest): string {
  return getAppBaseUrl(req.nextUrl.origin);
}

export async function POST(req: NextRequest) {
  try {
    if (isQaUnlockEnabled()) {
      return NextResponse.json(
        { error: qaPaymentDisabledMessage() },
        { status: 503 },
      );
    }

    const token = getAccessToken(req);
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userClient = createSupabaseUserClient(token);
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createSupabaseAdmin();
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("[stripe/portal] profile load failed:", profileError.message);
      return NextResponse.json(
        { error: BILLING_PORTAL_UNAVAILABLE },
        { status: 500 },
      );
    }

    if (!profile?.stripe_customer_id) {
      return NextResponse.json(
        { error: "No Stripe customer on file. Subscribe first." },
        { status: 400 },
      );
    }

    const baseUrl = appBaseUrl(req);
    const session = await getStripe().billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${baseUrl}/?billing=portal`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Stripe portal error:", err);
    return NextResponse.json(
      { error: toUserFacingBillingError(err, BILLING_PORTAL_UNAVAILABLE) },
      { status: 500 },
    );
  }
}
