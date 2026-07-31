import { NextRequest, NextResponse } from "next/server";
import type {
  BillingInterval,
  PaidPlan,
} from "@/lib/types/subscription";
import {
  getStripe,
  isPlaceholderPriceId,
  priceIdForSelection,
  PRO_TRIAL_DAYS,
} from "@/lib/stripe";
import {
  createSupabaseAdmin,
  createSupabaseUserClient,
} from "@/lib/supabase-admin";
import {
  isQaUnlockEnabled,
  qaPaymentDisabledMessage,
} from "@/lib/qa-mode";
import { getAppBaseUrl } from "@/lib/app-url";
import { assertEmailVerified } from "@/lib/ai-abuse";
import {
  BILLING_CHECKOUT_UNAVAILABLE,
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

function parseBody(raw: unknown): {
  plan: PaidPlan;
  interval: BillingInterval;
} {
  const body = (raw ?? {}) as {
    plan?: string;
    interval?: string;
  };

  // Legacy: { plan: "monthly" | "yearly" } meant Pro interval
  if (body.plan === "monthly" || body.plan === "yearly") {
    return { plan: "pro", interval: body.plan };
  }

  const plan: PaidPlan =
    body.plan === "pro_heavy" ? "pro_heavy" : "pro";
  const interval: BillingInterval =
    body.interval === "yearly" ? "yearly" : "monthly";

  return { plan, interval };
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

    const { plan, interval } = parseBody(await req.json());
    const priceId = priceIdForSelection({ plan, interval });

    if (isPlaceholderPriceId(priceId)) {
      console.error(
        "[stripe/checkout] Price IDs not configured (STRIPE_PRICE_PRO_* / STRIPE_PRICE_HEAVY_*).",
      );
      return NextResponse.json(
        {
          error:
            "Checkout is temporarily unavailable. Please try again later or contact support.",
        },
        { status: 500 },
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
              : "Verify your email before upgrading.",
          code: "email_unverified",
        },
        { status: 403 },
      );
    }

    const admin = createSupabaseAdmin();
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select(
        "stripe_customer_id, stripe_subscription_id, email, subscription_status, trial_ends_at",
      )
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("[stripe/checkout] profile load failed:", profileError.message);
      return NextResponse.json(
        { error: BILLING_CHECKOUT_UNAVAILABLE },
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

    // Signup already grants a 14-day Pro trial (profiles.trial_ends_at).
    // Do not stack a second Stripe trial for returning / post-trial users.
    const trialAlreadyUsed =
      Boolean(profile?.trial_ends_at) ||
      Boolean(profile?.stripe_subscription_id) ||
      profile?.subscription_status === "trialing" ||
      profile?.subscription_status === "pro" ||
      profile?.subscription_status === "active" ||
      profile?.subscription_status === "canceled" ||
      profile?.subscription_status === "past_due";

    const baseUrl = appBaseUrl(req);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        ...(trialAlreadyUsed ? {} : { trial_period_days: PRO_TRIAL_DAYS }),
        metadata: {
          supabase_user_id: user.id,
          plan,
          interval,
        },
      },
      metadata: {
        supabase_user_id: user.id,
        plan,
        interval,
        checkout_trial: trialAlreadyUsed ? "skipped" : "granted",
      },
      success_url: `${baseUrl}/app?billing=success`,
      cancel_url: `${baseUrl}/pricing?billing=canceled`,
      allow_promotion_codes: true,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Stripe checkout error:", err);
    return NextResponse.json(
      { error: toUserFacingBillingError(err, BILLING_CHECKOUT_UNAVAILABLE) },
      { status: 500 },
    );
  }
}
