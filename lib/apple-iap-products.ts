/**
 * Apple IAP product catalog — aligned with Stripe Pro / Pro Heavy × monthly / yearly.
 * Create matching auto-renewable subscriptions in App Store Connect.
 */

import type {
  BillingInterval,
  CheckoutSelection,
  PaidPlan,
  SubscriptionStatus,
} from "@/lib/types/subscription";

export const APPLE_BUNDLE_ID =
  process.env.APPLE_BUNDLE_ID?.trim() || "com.garagegenius.ai";

/** Default product IDs (override via env for staging). */
export const APPLE_PRODUCT_IDS = {
  PRO_MONTHLY:
    process.env.APPLE_IAP_PRO_MONTHLY?.trim() ||
    "com.garagegenius.ai.pro.monthly",
  PRO_YEARLY:
    process.env.APPLE_IAP_PRO_YEARLY?.trim() ||
    "com.garagegenius.ai.pro.yearly",
  HEAVY_MONTHLY:
    process.env.APPLE_IAP_HEAVY_MONTHLY?.trim() ||
    "com.garagegenius.ai.heavy.monthly",
  HEAVY_YEARLY:
    process.env.APPLE_IAP_HEAVY_YEARLY?.trim() ||
    "com.garagegenius.ai.heavy.yearly",
} as const;

export type AppleProductKey = keyof typeof APPLE_PRODUCT_IDS;

export const ALL_APPLE_PRODUCT_IDS: string[] = [
  APPLE_PRODUCT_IDS.PRO_MONTHLY,
  APPLE_PRODUCT_IDS.PRO_YEARLY,
  APPLE_PRODUCT_IDS.HEAVY_MONTHLY,
  APPLE_PRODUCT_IDS.HEAVY_YEARLY,
];

export function appleProductIdForSelection(
  selection: CheckoutSelection,
): string {
  const { plan, interval } = selection;
  if (plan === "pro_heavy") {
    return interval === "yearly"
      ? APPLE_PRODUCT_IDS.HEAVY_YEARLY
      : APPLE_PRODUCT_IDS.HEAVY_MONTHLY;
  }
  return interval === "yearly"
    ? APPLE_PRODUCT_IDS.PRO_YEARLY
    : APPLE_PRODUCT_IDS.PRO_MONTHLY;
}

export function planFromAppleProductId(
  productId: string | null | undefined,
): PaidPlan | null {
  if (!productId) return null;
  if (
    productId === APPLE_PRODUCT_IDS.HEAVY_MONTHLY ||
    productId === APPLE_PRODUCT_IDS.HEAVY_YEARLY
  ) {
    return "pro_heavy";
  }
  if (
    productId === APPLE_PRODUCT_IDS.PRO_MONTHLY ||
    productId === APPLE_PRODUCT_IDS.PRO_YEARLY
  ) {
    return "pro";
  }
  return null;
}

export function intervalFromAppleProductId(
  productId: string | null | undefined,
): BillingInterval | null {
  if (!productId) return null;
  if (
    productId === APPLE_PRODUCT_IDS.PRO_YEARLY ||
    productId === APPLE_PRODUCT_IDS.HEAVY_YEARLY
  ) {
    return "yearly";
  }
  if (
    productId === APPLE_PRODUCT_IDS.PRO_MONTHLY ||
    productId === APPLE_PRODUCT_IDS.HEAVY_MONTHLY
  ) {
    return "monthly";
  }
  return null;
}

export function subscriptionStatusFromAppleProduct(
  productId: string,
  opts?: { isTrialing?: boolean },
): SubscriptionStatus {
  if (opts?.isTrialing) return "trialing";
  const plan = planFromAppleProductId(productId);
  if (plan === "pro_heavy") return "pro_heavy";
  if (plan === "pro") return "pro";
  return "free";
}

/** App Store subscriptions management (system browser / Settings deep link). */
export const APPLE_MANAGE_SUBSCRIPTIONS_URL =
  "https://apps.apple.com/account/subscriptions";

/** Optional US “manage on website” secondary link (not the only purchase path). */
export function webManageSubscriptionUrl(): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "https://garagegenius.cloud";
  return `${base}/pricing`;
}
