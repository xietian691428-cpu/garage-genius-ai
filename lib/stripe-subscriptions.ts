/**
 * Sync Stripe.Subscription → public.stripe_subscriptions (admin MRR source).
 * Server-only.
 */

import type Stripe from "stripe";
import { createSupabaseAdmin, mapStripeStatus } from "@/lib/supabase-admin";
import { planFromPriceId } from "@/lib/stripe-prices";
import type { PaidPlan } from "@/lib/types/subscription";
import { PLAN_ENTITLEMENTS } from "@/lib/types/subscription";

function periodUnix(
  subscription: Stripe.Subscription,
  field: "start" | "end",
): number | null {
  const item = subscription.items.data[0] as
    | (Stripe.SubscriptionItem & {
        current_period_start?: number;
        current_period_end?: number;
      })
    | undefined;
  if (field === "start") {
    return (
      item?.current_period_start ??
      (subscription as unknown as { current_period_start?: number })
        .current_period_start ??
      null
    );
  }
  return (
    item?.current_period_end ??
    (subscription as unknown as { current_period_end?: number })
      .current_period_end ??
    null
  );
}

export function amountCentsFromPrice(price: Stripe.Price | undefined): number {
  if (!price) return 0;
  if (typeof price.unit_amount === "number") return price.unit_amount;
  return 0;
}

export function billingIntervalFromPrice(
  price: Stripe.Price | undefined,
): "month" | "year" | null {
  const interval = price?.recurring?.interval;
  if (interval === "month" || interval === "year") return interval;
  return null;
}

/** Normalize Stripe status into our stripe_subscriptions check constraint. */
export function mirrorSubscriptionStatus(
  raw: Stripe.Subscription.Status,
): string {
  switch (raw) {
    case "trialing":
    case "active":
    case "past_due":
    case "canceled":
    case "unpaid":
    case "incomplete":
    case "incomplete_expired":
    case "paused":
      return raw;
    default:
      return "canceled";
  }
}

export async function upsertStripeSubscriptionRow(
  subscription: Stripe.Subscription,
  userId: string,
): Promise<void> {
  const admin = createSupabaseAdmin();
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;

  const price = subscription.items.data[0]?.price;
  const priceId = price?.id ?? null;
  const plan: PaidPlan = planFromPriceId(priceId) ?? "pro";
  const interval = billingIntervalFromPrice(price);
  const amountCents = amountCentsFromPrice(price);
  const start = periodUnix(subscription, "start");
  const end = periodUnix(subscription, "end");

  const { error } = await admin.from("stripe_subscriptions").upsert(
    {
      user_id: userId,
      stripe_subscription_id: subscription.id,
      stripe_customer_id: customerId,
      stripe_price_id: priceId,
      status: mirrorSubscriptionStatus(subscription.status),
      plan,
      billing_interval: interval,
      amount_cents: amountCents,
      currency: (price?.currency || "usd").toLowerCase(),
      cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
      trial_ends_at: subscription.trial_end
        ? new Date(subscription.trial_end * 1000).toISOString()
        : null,
      current_period_start: start
        ? new Date(start * 1000).toISOString()
        : null,
      current_period_end: end ? new Date(end * 1000).toISOString() : null,
      raw_status: subscription.status,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "stripe_subscription_id" },
  );

  if (error) {
    console.error("[stripe_subscriptions] upsert failed:", error.message);
    throw error;
  }

  // Keep mapStripeStatus aligned (unused return — documents coupling)
  void mapStripeStatus(subscription.status, priceId);
}

export async function markStripeSubscriptionCanceled(
  subscriptionId: string,
): Promise<void> {
  const admin = createSupabaseAdmin();
  await admin
    .from("stripe_subscriptions")
    .update({
      status: "canceled",
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", subscriptionId);
}

export async function recordRevenueEvent(input: {
  userId?: string | null;
  stripeEventId?: string | null;
  stripeInvoiceId?: string | null;
  stripePaymentIntentId?: string | null;
  kind: "subscription" | "recharge" | "other";
  amountCents: number;
  currency?: string;
  plan?: string | null;
}): Promise<void> {
  if (input.amountCents <= 0) return;
  const admin = createSupabaseAdmin();
  const { error } = await admin.from("stripe_revenue_events").upsert(
    {
      user_id: input.userId ?? null,
      stripe_event_id: input.stripeEventId ?? null,
      stripe_invoice_id: input.stripeInvoiceId ?? null,
      stripe_payment_intent_id: input.stripePaymentIntentId ?? null,
      kind: input.kind,
      amount_cents: input.amountCents,
      currency: (input.currency || "usd").toLowerCase(),
      plan: input.plan ?? null,
    },
    { onConflict: "stripe_event_id", ignoreDuplicates: true },
  );
  if (error && !/duplicate|unique/i.test(error.message)) {
    console.warn("[stripe_revenue_events]", error.message);
  }
}

/** Catalog list price for MRR fallback when Stripe amount missing */
export function catalogMonthlyCents(plan: PaidPlan, interval: "month" | "year" | null): number {
  const ent = PLAN_ENTITLEMENTS[plan];
  if (interval === "year") {
    return Math.round((ent.priceYearly * 100) / 12);
  }
  return Math.round(ent.priceMonthly * 100);
}
