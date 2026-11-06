/**
 * Google Play subscription product IDs — same four SKUs as Apple IAP.
 * Create matching auto-renewable subscriptions in Play Console.
 */

import type {
  BillingInterval,
  CheckoutSelection,
  PaidPlan,
  SubscriptionStatus,
} from "@/lib/types/subscription";

function playEnv(name: string, fallback: string): string {
  const pub = process.env[`NEXT_PUBLIC_${name}`]?.trim();
  const priv = process.env[name]?.trim();
  return pub || priv || fallback;
}

export const GOOGLE_PLAY_PACKAGE_NAME = playEnv(
  "GOOGLE_PLAY_PACKAGE_NAME",
  "com.garagegenius.ai",
);

export const GOOGLE_PLAY_PRODUCT_IDS = {
  PRO_MONTHLY: playEnv(
    "GOOGLE_PLAY_PRO_MONTHLY",
    "com.garagegenius.ai.pro.monthly",
  ),
  PRO_YEARLY: playEnv(
    "GOOGLE_PLAY_PRO_YEARLY",
    "com.garagegenius.ai.pro.yearly",
  ),
  HEAVY_MONTHLY: playEnv(
    "GOOGLE_PLAY_HEAVY_MONTHLY",
    "com.garagegenius.ai.heavy.monthly",
  ),
  HEAVY_YEARLY: playEnv(
    "GOOGLE_PLAY_HEAVY_YEARLY",
    "com.garagegenius.ai.heavy.yearly",
  ),
} as const;

export const ALL_GOOGLE_PLAY_PRODUCT_IDS: string[] = [
  GOOGLE_PLAY_PRODUCT_IDS.PRO_MONTHLY,
  GOOGLE_PLAY_PRODUCT_IDS.PRO_YEARLY,
  GOOGLE_PLAY_PRODUCT_IDS.HEAVY_MONTHLY,
  GOOGLE_PLAY_PRODUCT_IDS.HEAVY_YEARLY,
];

/** Play Console base plan id. Create base plans with these ids (or override via env). */
export function googleBasePlanId(interval: BillingInterval): string {
  if (interval === "yearly") {
    return (
      process.env.NEXT_PUBLIC_GOOGLE_PLAY_BASE_PLAN_YEARLY?.trim() ||
      process.env.GOOGLE_PLAY_BASE_PLAN_YEARLY?.trim() ||
      "yearly"
    );
  }
  return (
    process.env.NEXT_PUBLIC_GOOGLE_PLAY_BASE_PLAN_MONTHLY?.trim() ||
    process.env.GOOGLE_PLAY_BASE_PLAN_MONTHLY?.trim() ||
    "monthly"
  );
}

export function googleProductIdForSelection(
  selection: CheckoutSelection,
): string {
  const { plan, interval } = selection;
  if (plan === "pro_heavy") {
    return interval === "yearly"
      ? GOOGLE_PLAY_PRODUCT_IDS.HEAVY_YEARLY
      : GOOGLE_PLAY_PRODUCT_IDS.HEAVY_MONTHLY;
  }
  return interval === "yearly"
    ? GOOGLE_PLAY_PRODUCT_IDS.PRO_YEARLY
    : GOOGLE_PLAY_PRODUCT_IDS.PRO_MONTHLY;
}

export function planFromGoogleProductId(
  productId: string | null | undefined,
): PaidPlan | null {
  if (!productId) return null;
  if (
    productId === GOOGLE_PLAY_PRODUCT_IDS.HEAVY_MONTHLY ||
    productId === GOOGLE_PLAY_PRODUCT_IDS.HEAVY_YEARLY
  ) {
    return "pro_heavy";
  }
  if (
    productId === GOOGLE_PLAY_PRODUCT_IDS.PRO_MONTHLY ||
    productId === GOOGLE_PLAY_PRODUCT_IDS.PRO_YEARLY
  ) {
    return "pro";
  }
  return null;
}

export function intervalFromGoogleProductId(
  productId: string | null | undefined,
): BillingInterval | null {
  if (!productId) return null;
  if (
    productId === GOOGLE_PLAY_PRODUCT_IDS.PRO_YEARLY ||
    productId === GOOGLE_PLAY_PRODUCT_IDS.HEAVY_YEARLY
  ) {
    return "yearly";
  }
  if (
    productId === GOOGLE_PLAY_PRODUCT_IDS.PRO_MONTHLY ||
    productId === GOOGLE_PLAY_PRODUCT_IDS.HEAVY_MONTHLY
  ) {
    return "monthly";
  }
  return null;
}

export function subscriptionStatusFromGoogleProduct(
  productId: string,
): SubscriptionStatus {
  const plan = planFromGoogleProductId(productId);
  if (plan === "pro_heavy") return "pro_heavy";
  if (plan === "pro") return "pro";
  return "free";
}

/** Play subscriptions management (system UI / Play Store). */
export const GOOGLE_PLAY_MANAGE_SUBSCRIPTIONS_URL =
  "https://play.google.com/store/account/subscriptions";
