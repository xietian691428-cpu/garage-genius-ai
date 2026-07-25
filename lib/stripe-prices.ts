import type {
  BillingInterval,
  CheckoutSelection,
  PaidPlan,
} from "@/lib/types/subscription";

/**
 * Stripe Price IDs — set in .env.local after creating products in Dashboard.
 * Safe to import from client-adjacent code (no Stripe SDK).
 */
export const PRICE_IDS = {
  PRO_MONTHLY:
    process.env.STRIPE_PRICE_PRO_MONTHLY ?? "price_your_pro_monthly_id",
  PRO_YEARLY:
    process.env.STRIPE_PRICE_PRO_YEARLY ?? "price_your_pro_yearly_id",
  HEAVY_MONTHLY:
    process.env.STRIPE_PRICE_HEAVY_MONTHLY ?? "price_your_heavy_monthly_id",
  HEAVY_YEARLY:
    process.env.STRIPE_PRICE_HEAVY_YEARLY ?? "price_your_heavy_yearly_id",
} as const;

export function priceIdForSelection(selection: CheckoutSelection): string {
  const { plan, interval } = selection;
  if (plan === "pro_heavy") {
    return interval === "yearly"
      ? PRICE_IDS.HEAVY_YEARLY
      : PRICE_IDS.HEAVY_MONTHLY;
  }
  return interval === "yearly" ? PRICE_IDS.PRO_YEARLY : PRICE_IDS.PRO_MONTHLY;
}

/** @deprecated prefer priceIdForSelection */
export function priceIdForPlan(interval: BillingInterval): string {
  return priceIdForSelection({ plan: "pro", interval });
}

export function planFromPriceId(
  priceId: string | null | undefined,
): PaidPlan | null {
  if (!priceId) return null;
  if (
    priceId === PRICE_IDS.HEAVY_MONTHLY ||
    priceId === PRICE_IDS.HEAVY_YEARLY
  ) {
    return "pro_heavy";
  }
  if (
    priceId === PRICE_IDS.PRO_MONTHLY ||
    priceId === PRICE_IDS.PRO_YEARLY
  ) {
    return "pro";
  }
  return null;
}

export function isPlaceholderPriceId(priceId: string): boolean {
  return priceId.includes("price_your_");
}
