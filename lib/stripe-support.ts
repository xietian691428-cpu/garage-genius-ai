/**
 * Server-side Stripe helpers for Subscription Support Coach.
 * Refunds are NEVER executed here — only queued for admin approval.
 */

import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import type {
  SupportBillingStatus,
  SupportInvoiceSummary,
} from "@/lib/types/subscription-support";
import { planFromPriceId } from "@/lib/stripe-prices";
import { entitlementsForTier } from "@/lib/types/subscription";
import type { SubscriptionTier } from "@/lib/types/subscription";

export type { SupportBillingStatus, SupportInvoiceSummary };

function customerIdOf(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined,
): string | null {
  if (!customer) return null;
  if (typeof customer === "string") return customer;
  return customer.id;
}

async function loadProfile(userId: string) {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("profiles")
    .select(
      "email, stripe_customer_id, stripe_subscription_id, subscription_status, current_period_end, trial_ends_at",
    )
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

function subscriptionPeriodEndIso(
  subscription: Stripe.Subscription | null,
  fallback: string | null,
): string | null {
  const item = subscription?.items?.data?.[0] as
    | { current_period_end?: number }
    | undefined;
  if (typeof item?.current_period_end === "number") {
    return new Date(item.current_period_end * 1000).toISOString();
  }
  if (typeof subscription?.cancel_at === "number") {
    return new Date(subscription.cancel_at * 1000).toISOString();
  }
  return fallback;
}

async function paymentRefFromInvoice(
  stripe: Stripe,
  invoiceId: string,
): Promise<{ chargeId: string | null; paymentIntentId: string | null }> {
  const inv = await stripe.invoices.retrieve(invoiceId, {
    expand: ["payments.data.payment.payment_intent"],
  });

  const payments = inv.payments?.data ?? [];
  for (const p of payments) {
    const payment = p.payment as {
      type?: string;
      charge?: string | { id?: string } | null;
      payment_intent?: string | { id?: string } | null;
    } | null;
    if (!payment) continue;
    if (payment.type === "charge") {
      const c = payment.charge;
      const chargeId = typeof c === "string" ? c : c?.id ?? null;
      if (chargeId) return { chargeId, paymentIntentId: null };
    }
    if (payment.type === "payment_intent") {
      const pi = payment.payment_intent;
      const paymentIntentId = typeof pi === "string" ? pi : pi?.id ?? null;
      if (paymentIntentId) return { chargeId: null, paymentIntentId };
    }
  }

  // Fallback: search charges by invoice metadata / customer recent
  const customer = customerIdOf(inv.customer);
  if (customer) {
    const charges = await stripe.charges.list({ customer, limit: 20 });
    const match = charges.data.find(
      (c) =>
        (c as { invoice?: string | null }).invoice === invoiceId ||
        c.metadata?.invoice_id === invoiceId,
    );
    if (match) {
      return {
        chargeId: match.id,
        paymentIntentId:
          typeof match.payment_intent === "string"
            ? match.payment_intent
            : match.payment_intent?.id ?? null,
      };
    }
  }

  return { chargeId: null, paymentIntentId: null };
}

function tierFromStripePrice(priceId: string | null | undefined): {
  tier: SubscriptionTier | "unknown";
  planLabel: string;
} {
  if (!priceId) return { tier: "unknown", planLabel: "Unknown" };
  const plan = planFromPriceId(priceId);
  if (!plan) return { tier: "unknown", planLabel: "Paid plan" };
  const ent = entitlementsForTier(plan);
  return { tier: plan, planLabel: ent.label };
}

export async function getSupportBillingStatus(
  userId: string,
): Promise<SupportBillingStatus> {
  const profile = await loadProfile(userId);
  const email = (profile?.email as string | null) ?? null;
  const customerId = (profile?.stripe_customer_id as string | null) ?? null;
  const profileStatus = (profile?.subscription_status as string | null) ?? null;
  const periodEnd = (profile?.current_period_end as string | null) ?? null;

  if (!customerId) {
    return {
      email,
      hasCustomer: false,
      customerId: null,
      subscriptionId: null,
      status: profileStatus || "free",
      cancelAtPeriodEnd: false,
      periodEnd,
      planLabel: "Free",
      tier: "free",
      pastDue: false,
      past_due_hint: "No Stripe customer yet — subscribe from Pricing first.",
      defaultPaymentMethod: null,
      invoices: [],
    };
  }

  const stripe = getStripe();
  let subscription: Stripe.Subscription | null = null;
  const subId = (profile?.stripe_subscription_id as string | null) ?? null;

  if (subId) {
    try {
      subscription = await stripe.subscriptions.retrieve(subId, {
        expand: ["default_payment_method", "items.data.price"],
      });
    } catch {
      subscription = null;
    }
  }

  if (!subscription) {
    const list = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 1,
      expand: ["data.default_payment_method", "data.items.data.price"],
    });
    subscription = list.data[0] ?? null;
  }

  const priceId =
    subscription?.items?.data?.[0]?.price &&
    typeof subscription.items.data[0].price !== "string"
      ? subscription.items.data[0].price.id
      : null;
  const { tier, planLabel } = tierFromStripePrice(priceId);
  const status = subscription?.status ?? profileStatus ?? "unknown";
  const pastDue = status === "past_due" || status === "unpaid";

  let defaultPaymentMethod: string | null = null;
  const pm = subscription?.default_payment_method;
  if (pm && typeof pm !== "string" && pm.type === "card" && pm.card) {
    defaultPaymentMethod = `${pm.card.brand?.toUpperCase() ?? "CARD"} ···· ${pm.card.last4}`;
  }

  const invoicesRaw = await stripe.invoices.list({
    customer: customerId,
    limit: 8,
  });

  const invoices: SupportInvoiceSummary[] = invoicesRaw.data.map((inv) => ({
    id: inv.id,
    number: inv.number,
    status: inv.status,
    amountPaid: inv.amount_paid ?? 0,
    currency: inv.currency ?? "usd",
    created: new Date((inv.created ?? 0) * 1000).toISOString(),
    hostedInvoiceUrl: inv.hosted_invoice_url ?? null,
    invoicePdf: inv.invoice_pdf ?? null,
    chargeId: null,
  }));

  const subPeriodEnd = subscriptionPeriodEndIso(subscription, periodEnd);

  return {
    email,
    hasCustomer: true,
    customerId,
    subscriptionId: subscription?.id ?? subId,
    status,
    cancelAtPeriodEnd: Boolean(subscription?.cancel_at_period_end),
    periodEnd: subPeriodEnd,
    planLabel: tier === "unknown" && !subscription ? "Free" : planLabel,
    tier: subscription ? tier : "free",
    pastDue,
    past_due_hint: pastDue
      ? "Payment failed — update your card to restore Pro."
      : status === "active" || status === "trialing"
        ? "Billing looks healthy."
        : `Status: ${status}.`,
    defaultPaymentMethod,
    invoices,
  };
}

export type PortalFlow =
  | "default"
  | "payment_method_update"
  | "subscription_cancel";

export async function createSupportPortalSession(opts: {
  customerId: string;
  returnUrl: string;
  flow: PortalFlow;
  subscriptionId?: string | null;
}): Promise<string> {
  const stripe = getStripe();
  const params: Stripe.BillingPortal.SessionCreateParams = {
    customer: opts.customerId,
    return_url: opts.returnUrl,
  };

  if (opts.flow === "payment_method_update") {
    params.flow_data = { type: "payment_method_update" };
  } else if (opts.flow === "subscription_cancel" && opts.subscriptionId) {
    params.flow_data = {
      type: "subscription_cancel",
      subscription_cancel: { subscription: opts.subscriptionId },
    };
  }

  const session = await stripe.billingPortal.sessions.create(params);
  if (!session.url) throw new Error("Portal session missing URL");
  return session.url;
}

/** Resend / expose invoice — never invents charges. */
export async function resendSupportInvoice(opts: {
  customerId: string;
  invoiceId: string;
}): Promise<{ ok: true; mode: "emailed" | "hosted"; url: string | null }> {
  const stripe = getStripe();
  const invoice = await stripe.invoices.retrieve(opts.invoiceId);
  if (customerIdOf(invoice.customer) !== opts.customerId) {
    throw new Error("Invoice does not belong to this customer");
  }

  // Open invoices can be emailed via Stripe
  if (invoice.status === "open" || invoice.status === "draft") {
    try {
      const sent = await stripe.invoices.sendInvoice(opts.invoiceId);
      return {
        ok: true,
        mode: "emailed",
        url: sent.hosted_invoice_url ?? invoice.hosted_invoice_url ?? null,
      };
    } catch {
      /* fall through to hosted link */
    }
  }

  return {
    ok: true,
    mode: "hosted",
    url: invoice.hosted_invoice_url ?? invoice.invoice_pdf ?? null,
  };
}

export async function queueRefundRequest(opts: {
  userId: string;
  email: string;
  verifyEmail: string;
  invoiceId: string;
  reason?: string;
  clientSessionId?: string;
}): Promise<{ requestId: string }> {
  if (
    opts.verifyEmail.trim().toLowerCase() !== opts.email.trim().toLowerCase()
  ) {
    throw new Error("Email verification failed — type your account email exactly");
  }

  const status = await getSupportBillingStatus(opts.userId);
  if (!status.customerId) {
    throw new Error("No Stripe customer on file");
  }

  const invoice = status.invoices.find((i) => i.id === opts.invoiceId);
  if (!invoice) {
    // Re-fetch to validate ownership
    const stripe = getStripe();
    const inv = await stripe.invoices.retrieve(opts.invoiceId);
    if (customerIdOf(inv.customer) !== status.customerId) {
      throw new Error("Invoice not found for this account");
    }
  }

  const stripe = getStripe();
  const inv = await stripe.invoices.retrieve(opts.invoiceId);
  if (customerIdOf(inv.customer) !== status.customerId) {
    throw new Error("Invoice not found for this account");
  }
  if (inv.status !== "paid") {
    throw new Error("Only paid invoices can be queued for refund review");
  }

  const ref = await paymentRefFromInvoice(stripe, opts.invoiceId);

  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("subscription_support_requests")
    .insert({
      user_id: opts.userId,
      kind: "refund",
      status: "pending_human",
      stripe_customer_id: status.customerId,
      stripe_subscription_id: status.subscriptionId,
      stripe_invoice_id: opts.invoiceId,
      stripe_charge_id: ref.chargeId,
      amount_cents: inv.amount_paid ?? 0,
      currency: inv.currency ?? "usd",
      reason: (opts.reason || "").slice(0, 1000) || null,
      client_session_id: opts.clientSessionId ?? null,
      metadata: {
        invoice_number: inv.number,
        payment_intent_id: ref.paymentIntentId,
        queued_via: "subscription_support_coach",
      },
    })
    .select("id")
    .single();

  if (error) {
    if (/subscription_support_requests|does not exist|schema cache/i.test(error.message)) {
      throw new Error(
        "Refund queue table missing — apply migration 024_subscription_support_requests.sql",
      );
    }
    throw new Error(error.message);
  }

  return { requestId: data.id as string };
}

/**
 * Admin-only: execute Stripe refund after human approval.
 */
export async function approveAndExecuteRefund(opts: {
  requestId: string;
  adminEmail: string;
  note?: string;
}): Promise<{ refundId: string }> {
  const admin = createSupabaseAdmin();
  const { data: row, error } = await admin
    .from("subscription_support_requests")
    .select("*")
    .eq("id", opts.requestId)
    .maybeSingle();

  if (error || !row) throw new Error(error?.message || "Request not found");
  if (row.kind !== "refund") throw new Error("Not a refund request");
  if (row.status !== "pending_human") {
    throw new Error(`Request status is ${row.status}, expected pending_human`);
  }
  if (!row.stripe_charge_id && !row.stripe_invoice_id) {
    throw new Error("Missing charge/invoice on request");
  }

  const stripe = getStripe();
  let refund: Stripe.Refund;

  if (row.stripe_charge_id) {
    refund = await stripe.refunds.create({
      charge: row.stripe_charge_id as string,
      reason: "requested_by_customer",
      metadata: {
        support_request_id: opts.requestId,
        approved_by: opts.adminEmail,
      },
    });
  } else if (row.stripe_invoice_id) {
    const ref = await paymentRefFromInvoice(
      stripe,
      row.stripe_invoice_id as string,
    );
    if (ref.chargeId) {
      refund = await stripe.refunds.create({
        charge: ref.chargeId,
        reason: "requested_by_customer",
        metadata: {
          support_request_id: opts.requestId,
          approved_by: opts.adminEmail,
        },
      });
    } else if (ref.paymentIntentId) {
      refund = await stripe.refunds.create({
        payment_intent: ref.paymentIntentId,
        reason: "requested_by_customer",
        metadata: {
          support_request_id: opts.requestId,
          approved_by: opts.adminEmail,
        },
      });
    } else {
      throw new Error("Invoice has no charge/payment_intent to refund");
    }
  } else {
    throw new Error("Missing charge/invoice on request");
  }

  await admin
    .from("subscription_support_requests")
    .update({
      status: "completed",
      stripe_refund_id: refund.id,
      reviewed_by: opts.adminEmail,
      reviewed_at: new Date().toISOString(),
      admin_note: opts.note?.slice(0, 1000) ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", opts.requestId);

  return { refundId: refund.id };
}

export async function rejectRefundRequest(opts: {
  requestId: string;
  adminEmail: string;
  note?: string;
}): Promise<void> {
  const admin = createSupabaseAdmin();
  const { error } = await admin
    .from("subscription_support_requests")
    .update({
      status: "rejected",
      reviewed_by: opts.adminEmail,
      reviewed_at: new Date().toISOString(),
      admin_note: opts.note?.slice(0, 1000) ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", opts.requestId)
    .eq("status", "pending_human");
  if (error) throw new Error(error.message);
}
