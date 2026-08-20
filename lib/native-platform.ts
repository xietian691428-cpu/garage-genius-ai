/**
 * Capacitor / store-shell detection and billing policy helpers.
 * Web → Stripe Checkout. iOS native → StoreKit 2 IAP. Android native → blocked until Play Billing.
 */

type CapacitorBridge = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
};

export type NativeBillingMode = "web_stripe" | "native_iap" | "native_blocked";

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

/** Set by the native shell client so subsequent SSR requests stay store-safe. */
export const NATIVE_STORE_SHELL_COOKIE = "gg_store_shell";

/** Landing CTA / kicker when store shell (no web trial pitch). */
export const NATIVE_LANDING_CTA = "Create account";
export const NATIVE_LANDING_KICKER =
  "Free to start · Sign in to save your vehicles and chat history";

export function userAgentLooksNative(ua: string | null | undefined): boolean {
  return Boolean(ua && ua.includes(NATIVE_UA_TOKEN));
}

/**
 * Capacitor / in-app WKWebView often omits Mobile Safari's Version/ + Safari/
 * tokens. Treat those as store shell for SSR so Landing never paints trial CTAs
 * before JS hydrates — without breaking real Mobile Safari marketing.
 */
export function userAgentLooksLikeIosAppWebView(
  ua: string | null | undefined,
): boolean {
  if (!ua) return false;
  if (userAgentLooksNative(ua)) return true;
  if (!/iPhone|iPad|iPod/i.test(ua)) return false;
  if (/Version\//i.test(ua) && /Safari\//i.test(ua)) return false;
  return /AppleWebKit/i.test(ua);
}

export function storeShellCookieIsSet(
  value: string | null | undefined,
): boolean {
  return value === "1";
}

/** Server request looks like Capacitor / store shell (UA token, cookie, or WKWebView). */
export function requestLooksStoreShell(input: {
  userAgent?: string | null;
  storeShellCookie?: string | null;
}): boolean {
  return (
    userAgentLooksNative(input.userAgent) ||
    userAgentLooksLikeIosAppWebView(input.userAgent) ||
    storeShellCookieIsSet(input.storeShellCookie)
  );
}

function clientStoreShellCookiePresent(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie
    .split(";")
    .some((part) => part.trim() === `${NATIVE_STORE_SHELL_COOKIE}=1`);
}

/** True inside App Store / Play WebView (or Cap shell). */
export function isStoreShellClient(): boolean {
  if (isNativeCapacitor()) return true;
  if (typeof navigator !== "undefined") {
    if (userAgentLooksNative(navigator.userAgent)) return true;
    if (userAgentLooksLikeIosAppWebView(navigator.userAgent)) return true;
  }
  if (clientStoreShellCookiePresent()) return true;
  return false;
}

/**
 * Hide purchase CTAs only when no in-app purchase path exists.
 * iOS Capacitor uses StoreKit — keep upgrade / pricing CTAs visible.
 * Android Capacitor stays blocked until Play Billing ships.
 */
export function hideStorePurchaseUi(): boolean {
  if (isNativeIos()) return false;
  if (isNativeCapacitor()) return true;
  // WKWebView heuristic without Cap bridge (SSR flash / edge) — treat as iOS store shell → show IAP UI
  if (typeof navigator !== "undefined") {
    if (userAgentLooksLikeIosAppWebView(navigator.userAgent)) return false;
    if (userAgentLooksNative(navigator.userAgent)) {
      // UA token without platform — prefer showing IAP (iOS primary store)
      return false;
    }
  }
  if (clientStoreShellCookiePresent()) {
    // Cookie alone: show IAP (iOS). Android will still block at purchase time.
    return false;
  }
  return false;
}

/**
 * Web → Stripe Checkout / portal.
 * iOS native → StoreKit 2.
 * Android native → blocked (no Play Billing yet).
 */
export function getBillingMode(): NativeBillingMode {
  if (!isNativeCapacitor()) {
    // Heuristic store shell without Cap still must not open Stripe in WebView
    if (isStoreShellClient()) return "native_iap";
    return "web_stripe";
  }
  if (getCapacitorPlatform() === "ios") return "native_iap";
  return "native_blocked";
}

export function canUseStripeCheckout(): boolean {
  return getBillingMode() === "web_stripe";
}

export function canUseNativeIap(): boolean {
  return getBillingMode() === "native_iap";
}

/**
 * Hide Stripe Checkout, token packs, and “buy/manage on website” CTAs.
 * iOS App Store Guideline 3.1.1: digital goods in the binary must use IAP.
 */
export function hideWebCheckoutUi(
  mode: NativeBillingMode = getBillingMode(),
): boolean {
  return mode !== "web_stripe";
}

/** Android / blocked shells — purchases unavailable. */
export const NATIVE_NO_IAP_MESSAGE =
  "In-app purchases are not available on this platform yet. On iPhone/iPad, upgrade with Apple In-App Purchase. On the website, you can manage billing with Stripe.";

export const NATIVE_ACCOUNT_LIMITS_TITLE = "Upgrade your plan";

export const NATIVE_ACCOUNT_LIMITS_BODY =
  "This feature isn’t included with your current plan. Subscribe with Apple In-App Purchase to unlock Pro.";

export const NATIVE_WEBSITE_MANAGE_HINT =
  "Purchases in this app use Apple In-App Purchase. Manage or cancel in Settings → Apple ID → Subscriptions.";

export const NATIVE_TERMS_BILLING_HEADING = "5. Accounts & billing";

export const NATIVE_TERMS_BILLING_BULLETS = [
  "In the iOS app, Pro and Pro Heavy are sold as auto-renewable Apple In-App Purchases.",
  "On the website, paid plans are billed through Stripe.",
  "Account entitlements follow the signed-in Garage Genius account after Apple or Stripe verification.",
  "Deleting your account cancels access immediately; Apple subscriptions are managed in Apple ID settings.",
] as const;

export const NATIVE_DELETE_ACCOUNT_BODY =
  "Permanently deletes your Garage Genius account, vehicles, chats, maintenance history, and inventory we store for you. This cannot be undone. Apple subscriptions must be canceled separately in your Apple ID settings.";

export const NATIVE_PRIVACY_BILLING =
  "Apple App Store transaction identifiers and plan status (for iOS In-App Purchases); Stripe customer IDs and plan status on the website (card details are handled by Apple or Stripe, not stored on our servers).";

export const NATIVE_PRIVACY_PUSH =
  "reminder endpoint if you enable maintenance reminders.";

export const NATIVE_PRIVACY_USE =
  "Process invoices, subscriptions, account limits, and support requests.";

export const NATIVE_PRIVACY_CHOICES =
  "You can sign out, manage Apple subscriptions in your Apple ID settings, review plan details on the Garage Genius website, decline AI provider consent (DeepSeek) until you agree, disable push reminders, limit what vehicle or photo data you enter, and delete your account.";

export function nativeUpgradeBlockedMessage(): string {
  const mode = getBillingMode();
  if (mode === "native_iap") {
    return "Use Apple In-App Purchase in this app to change your plan.";
  }
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
  // Keep trial word soft on store-facing badges
  if (!isStoreShellClient()) return input.label;
  return storeSafePlanLabel(input);
}
