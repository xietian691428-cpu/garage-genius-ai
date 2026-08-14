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

/** Appended in capacitor.config.ts so SSR can tell store WebViews from Mobile Safari. */
export const NATIVE_UA_TOKEN = "GarageGeniusNative";

export function userAgentLooksNative(ua: string | null | undefined): boolean {
  return Boolean(ua && ua.includes(NATIVE_UA_TOKEN));
}

/**
 * Hide purchase / trial CTAs in App Store and Play shells.
 * Web keeps Stripe + 14-day trial copy.
 */
export function hideStorePurchaseUi(): boolean {
  if (isNativeCapacitor()) return true;
  if (typeof navigator !== "undefined" && userAgentLooksNative(navigator.userAgent)) {
    return true;
  }
  return false;
}

/**
 * Web → Stripe Checkout / portal.
 * Native → block Stripe; do not offer StoreKit in this phase.
 */
export function getBillingMode(): NativeBillingMode {
  if (!isNativeCapacitor()) return "web_stripe";
  return "native_blocked";
}

/** Informational only — no purchase CTAs; avoid trial/upgrade/subscription words. */
export const NATIVE_NO_IAP_MESSAGE =
  "Purchases and plan changes are not available in this app. Account plan details are on the Garage Genius website.";

export const NATIVE_ACCOUNT_LIMITS_TITLE = "Account limits";

export const NATIVE_ACCOUNT_LIMITS_BODY =
  "This feature isn’t included with your current account. Purchases are not available in this app.";

export const NATIVE_WEBSITE_MANAGE_HINT =
  "Plan changes are handled on our website.";

export const NATIVE_TERMS_BILLING_HEADING = "5. Accounts & billing";

export const NATIVE_TERMS_BILLING_BULLETS = [
  "Purchases and plan changes are not available in this app.",
  "Account plan details are on the Garage Genius website.",
  "Account limits in the app follow the signed-in account. Existing vehicles and history remain readable.",
  "Deleting your account cancels access immediately.",
] as const;

export const NATIVE_DELETE_ACCOUNT_BODY =
  "Permanently deletes your Garage Genius account, vehicles, chats, maintenance history, and inventory we store for you. This cannot be undone.";

export const NATIVE_PRIVACY_BILLING =
  "Stripe customer IDs and plan status (card details are handled by Stripe, not stored on our servers).";

export const NATIVE_PRIVACY_PUSH =
  "reminder endpoint if you enable maintenance reminders.";

export const NATIVE_PRIVACY_USE =
  "Process invoices, account limits, and support requests.";

export const NATIVE_PRIVACY_CHOICES =
  "You can sign out, review account plan details on the Garage Genius website, disable push reminders, limit what vehicle or photo data you enter, and delete your account.";

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
