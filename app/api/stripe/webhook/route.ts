import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { createSupabaseAdmin, mapStripeStatus } from "@/lib/supabase-admin";
import { tokenService } from "@/lib/token-service";
import { planFromPriceId } from "@/lib/stripe-prices";
import {
  markStripeSubscriptionCanceled,
  recordRevenueEvent,
  upsertStripeSubscriptionRow,
} from "@/lib/stripe-subscriptions";

export const runtime = "nodejs";

async function creditTokenRecharge(session: Stripe.Checkout.Session) {
  if (session.metadata?.type !== "token_recharge") return;

  const userId = session.metadata.supabase_user_id;
  const tokens = Number(session.metadata.tokens);
  const amountUsd = Number(session.metadata.amount_usd);

  if (!userId || !Number.isFinite(tokens) || tokens <= 0) {
    console.warn("Webhook: invalid token_recharge metadata", session.id);
    return;
  }

  const paymentKey =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? session.id;

  const admin = createSupabaseAdmin();
  const { data: existing } = await admin
    .from("token_purchases")
    .select("id")
    .eq("stripe_payment_intent_id", paymentKey)
    .maybeSingle();

  if (existing) {
    console.log("Webhook: token recharge already credited", paymentKey);
    return;
  }

  await tokenService.addBonusTokens(
    userId,
    tokens,
    Number.isFinite(amountUsd) ? amountUsd : 0,
    paymentKey,
  );

  await recordRevenueEvent({
    userId,
    stripeEventId: `recharge_${paymentKey}`,
    stripePaymentIntentId: paymentKey,
    kind: "recharge",
    amountCents: Math.round((Number.isFinite(amountUsd) ? amountUsd : 0) * 100),
    currency: "usd",
  });
}

async function syncSubscriptionToProfile(
  subscription: Stripe.Subscription,
  userIdHint?: string | null,
) {
  const admin = createSupabaseAdmin();
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;

  const supabaseUserId =
    userIdHint ||
    subscription.metadata?.supabase_user_id ||
    (await getStripe()
      .customers.retrieve(customerId)
      .then((c) => (!c.deleted ? c.metadata?.supabase_user_id : undefined)));

  if (!supabaseUserId) {
    console.warn("Webhook: missing supabase_user_id for", customerId);
    return;
  }

  const priceId = subscription.items.data[0]?.price?.id ?? null;
  const status = mapStripeStatus(subscription.status, priceId);
  const trialEnd = subscription.trial_end
    ? new Date(subscription.trial_end * 1000).toISOString()
    : null;
  const periodEnd = subscription.items.data[0]?.current_period_end
    ? new Date(
        subscription.items.data[0].current_period_end * 1000,
      ).toISOString()
    : null;

  const patch = {
    stripe_customer_id: customerId,
    stripe_subscription_id: subscription.id,
    subscription_status: status,
    trial_ends_at: trialEnd,
    current_period_end: periodEnd,
  };

  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .eq("id", supabaseUserId)
    .maybeSingle();

  // Update existing rows so a missing email column is never clobbered to null.
  const { error } = existing
    ? await admin.from("profiles").update(patch).eq("id", supabaseUserId)
    : await admin.from("profiles").insert({ id: supabaseUserId, ...patch });

  if (error) {
    console.error("Webhook profile upsert failed:", error.message);
    throw error;
  }

  await upsertStripeSubscriptionRow(subscription, supabaseUserId);
}

async function markCanceledByCustomer(
  customerId: string,
  subscriptionId?: string,
) {
  const admin = createSupabaseAdmin();
  const { error } = await admin
    .from("profiles")
    .update({
      subscription_status: "canceled",
      stripe_subscription_id: null,
    })
    .eq("stripe_customer_id", customerId);

  if (error) {
    console.error("Webhook cancel update failed:", error.message);
    throw error;
  }

  if (subscriptionId) {
    await markStripeSubscriptionCanceled(subscriptionId);
  }
}

async function handleInvoicePaid(invoice: Stripe.Invoice, eventId: string) {
  const customerId =
    typeof invoice.customer === "string"
      ? invoice.customer
      : invoice.customer?.id;
  if (!customerId) return;

  const amountCents = invoice.amount_paid ?? 0;
  if (amountCents <= 0) return;

  const admin = createSupabaseAdmin();
  const { data: profile } = await admin
    .from("profiles")
    .select("id, stripe_subscription_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  const line = invoice.lines?.data?.[0] as
    | { price?: { id?: string } | string | null }
    | undefined;
  const priceId =
    typeof line?.price === "string"
      ? line.price
      : line?.price?.id ?? null;
  const plan = planFromPriceId(priceId);

  const inv = invoice as Stripe.Invoice & {
    payment_intent?: string | { id?: string } | null;
  };
  const paymentIntent =
    typeof inv.payment_intent === "string"
      ? inv.payment_intent
      : inv.payment_intent?.id ?? null;

  await recordRevenueEvent({
    userId: profile?.id ?? null,
    stripeEventId: eventId,
    stripeInvoiceId: invoice.id,
    stripePaymentIntentId: paymentIntent,
    kind: "subscription",
    amountCents,
    currency: invoice.currency || "usd",
    plan: plan ?? null,
  });
}

export async function POST(req: NextRequest) {
  const signature = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    return NextResponse.json(
      { error: "Missing Stripe webhook signature or secret" },
      { status: 400 },
    );
  }

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(
      rawBody,
      signature,
      webhookSecret,
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Invalid webhook signature";
    console.error("Stripe webhook verify failed:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        if (session.mode === "payment") {
          await creditTokenRecharge(session);
          break;
        }

        if (session.mode !== "subscription" || !session.subscription) break;

        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription.id;
        const subscription =
          await getStripe().subscriptions.retrieve(subscriptionId);
        await syncSubscriptionToProfile(
          subscription,
          session.metadata?.supabase_user_id,
        );
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        await syncSubscriptionToProfile(subscription);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId =
          typeof subscription.customer === "string"
            ? subscription.customer
            : subscription.customer.id;
        await markCanceledByCustomer(customerId, subscription.id);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId =
          typeof invoice.customer === "string"
            ? invoice.customer
            : invoice.customer?.id;
        if (!customerId) break;

        const admin = createSupabaseAdmin();
        await admin
          .from("profiles")
          .update({ subscription_status: "past_due" })
          .eq("stripe_customer_id", customerId);
        break;
      }

      case "invoice.paid":
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoicePaid(invoice, event.id);
        break;
      }

      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("Stripe webhook handler error:", err);
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 },
    );
  }
}
