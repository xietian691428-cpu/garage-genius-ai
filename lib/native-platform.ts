/**
 * Capacitor / store-shell detection and billing policy helpers.
 * Keep digital-goods purchases out of the in-app WebView Stripe path.
 */

export type NativeBillingMode =
  | "web_stripe"
  | "native_iap_required"
  | "external_link_allowed";

export function isNativeCapacitor(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (
    window as Window & {
      Capacitor?: { isNativePlatform?: () => boolean };
    }
  ).Capacitor;
  try {
    return Boolean(cap?.isNativePlatform?.());
  } catch {
    return false;
  }
}

/**
 * Recommended store policy until StoreKit / Play Billing is wired:
 * - Web → Stripe
 * - Native → block Stripe Checkout; show honest upgrade messaging
 */
export function getBillingMode(): NativeBillingMode {
  if (!isNativeCapacitor()) return "web_stripe";
  return "native_iap_required";
}

export function nativeUpgradeBlockedMessage(): string {
  return "In-app subscriptions must use the App Store / Google Play billing system. Open Garage Genius on the web (garagegenius.cloud) for Stripe checkout, or wait for in-app purchases in a future update.";
}
