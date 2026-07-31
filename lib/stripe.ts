import Stripe from "stripe";
import { TRIAL_DAYS } from "@/lib/subscription";

export {
  PRICE_IDS,
  priceIdForSelection,
  priceIdForPlan,
  planFromPriceId,
  isPlaceholderPriceId,
} from "@/lib/stripe-prices";

let stripeClient: Stripe | null = null;

/** Lazily create Stripe client so missing keys don't break `next build`. */
export function getStripe(): Stripe {
  if (stripeClient) return stripeClient;

  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    throw new Error("Missing STRIPE_SECRET_KEY");
  }

  // Catch mis-pasted Price IDs / publishable keys into the secret slot early.
  if (!key.startsWith("sk_test_") && !key.startsWith("sk_live_")) {
    console.error(
      "[stripe] STRIPE_SECRET_KEY must start with sk_test_ or sk_live_ (got unexpected format).",
    );
    throw new Error("Missing STRIPE_SECRET_KEY");
  }

  stripeClient = new Stripe(key, {
    // Must match stripe package LatestApiVersion (stripe@22 → 2026-06-24.dahlia)
    apiVersion: "2026-06-24.dahlia",
  });

  return stripeClient;
}

/** Launch: new Checkout subscriptions get a temporary Pro trial (PROJECT.md). */
export const PRO_TRIAL_DAYS = TRIAL_DAYS;
