/**
 * Capacitor / store-shell detection and billing policy helpers.
 * Digital goods are never sold inside the native WebView (no Stripe, no StoreKit).
 */

type CapacitorBridge = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
};

export type NativeBillingMode = "web_stripe" | "native_blocked";

export type CapacitorPlatformId = "ios" | "android" | "web";

function capacitorBridge(): CapacitorBridge | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { Capacitor?: CapacitorBridge }).Capacitor;
}

export function isNativeCapacitor(): boolean {
  const cap = capacitorBridge();
  try {
    return Boolean(cap?.isNativePlatform?.());
  } catch {
    return false;
  }
}

/** `Capacitor.getPlatform()` when running in a native shell. */
export function getCapacitorPlatform(): CapacitorPlatformId {
  if (!isNativeCapacitor()) return "web";
  try {
    const raw = capacitorBridge()?.getPlatform?.()?.toLowerCase() ?? "";
    if (raw === "ios") return "ios";
    if (raw === "android") return "android";
  } catch {
    /* fall through */
  }
  return "web";
}

export function isNativeIos(): boolean {
  return getCapacitorPlatform() === "ios";
}

/**
 * Hide purchase / trial CTAs in App Store and Play shells.
 * Web keeps Stripe + 14-day trial copy.
 */
export function hideStorePurchaseUi(): boolean {
  return isNativeCapacitor();
}

/**
 * Web → Stripe Checkout / portal.
 * Native → block Stripe; do not offer StoreKit in this phase.
 */
export function getBillingMode(): NativeBillingMode {
  if (!isNativeCapacitor()) return "web_stripe";
  return "native_blocked";
}

/** Informational only — never mentions IAP, trials, or a buy button. */
export const NATIVE_NO_IAP_MESSAGE =
  "This app does not sell subscriptions or extra AI quota. Manage those on the Garage Genius website if you already have an account.";

export const NATIVE_ACCOUNT_LIMITS_TITLE = "Account limits";

export const NATIVE_ACCOUNT_LIMITS_BODY =
  "This feature isn’t included with your current account. The iOS app does not offer trial signup or paid upgrades.";

export const NATIVE_WEBSITE_MANAGE_HINT =
  "Subscriptions are purchased only on the website — not in this app.";

export function nativeUpgradeBlockedMessage(): string {
  return NATIVE_NO_IAP_MESSAGE;
}

export function storeSafePlanLabel(input: {
  label: string;
  isTrialing?: boolean;
}): string {
  if (input.isTrialing) return "Pro";
  if (/trial/i.test(input.label)) return "Pro";
  return input.label;
}

export function nativePlanDisplayLabel(input: {
  label: string;
  isTrialing?: boolean;
}): string {
  if (!hideStorePurchaseUi()) return input.label;
  return storeSafePlanLabel(input);
}
