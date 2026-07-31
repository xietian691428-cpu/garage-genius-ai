import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import {
  createSupabaseAdmin,
  createSupabaseUserClient,
} from "@/lib/supabase-admin";
import { findRechargePack } from "@/lib/types/tokens";
import {
  isQaUnlockEnabled,
  qaPaymentDisabledMessage,
} from "@/lib/qa-mode";
import { getAppBaseUrl } from "@/lib/app-url";
import { assertEmailVerified } from "@/lib/ai-abuse";
import {
  BILLING_RECHARGE_UNAVAILABLE,
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

/**
 * POST /api/stripe/recharge
 * One-time Checkout for token packs (PROJECT.md top-up strategy).
 */
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
      return NextResponse.json(
        { error: "Sign in required to buy tokens." },
        { status: 401 },
      );
    }

    const body = (await req.json()) as { tokens?: number; price?: number };
    const tokens = Number(body.tokens);
    const price = Number(body.price);
    const pack = findRechargePack(tokens, price);

    if (!pack) {
      return NextResponse.json(
        { error: "Invalid recharge pack." },
        { status: 400 },
      );
    }

    const userClient = createSupabaseUserClient(token);
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
      assertEmailVerified(user);
    } catch (err) {
      return NextResponse.json(
        {
          error:
            err instanceof Error
              ? err.message
              : "Verify your email before buying tokens.",
          code: "email_unverified",
        },
        { status: 403 },
      );
    }

    const admin = createSupabaseAdmin();
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("stripe_customer_id, email")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      return NextResponse.json(
        { error: profileError.message },
        { status: 500 },
      );
    }

    const stripe = getStripe();
    let customerId = profile?.stripe_customer_id ?? null;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? profile?.email ?? undefined,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;

      await admin.from("profiles").upsert({
        id: user.id,
        email: user.email ?? profile?.email ?? null,
        stripe_customer_id: customerId,
      });
    }

    const baseUrl = appBaseUrl(req);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: customerId,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: Math.round(pack.priceUsd * 100),
            product_data: {
              name: `Garage Genius — ${pack.label}`,
              description: `${pack.tokens.toLocaleString()} bonus tokens (top-up)`,
            },
          },
        },
      ],
      metadata: {
        type: "token_recharge",
        supabase_user_id: user.id,
        tokens: String(pack.tokens),
        pack_id: pack.id,
        amount_usd: String(pack.priceUsd),
      },
      success_url: `${baseUrl}/recharge?status=success`,
      cancel_url: `${baseUrl}/recharge?status=canceled`,
      allow_promotion_codes: true,
    });

    if (!session.url) {
      return NextResponse.json(
        { error: "Stripe did not return a checkout URL." },
        { status: 500 },
      );
    }

    return NextResponse.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error("Stripe recharge error:", err);
    return NextResponse.json(
      { error: toUserFacingBillingError(err, BILLING_RECHARGE_UNAVAILABLE) },
      { status: 500 },
    );
  }
}
