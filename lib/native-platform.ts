/**
 * Capacitor / store-shell detection and billing policy helpers.
 * Web → Stripe Checkout. iOS native → StoreKit 2. Android native → Google Play Billing.
 */

type CapacitorBridge = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
};

export type NativeBillingMode =
  | "web_stripe"
  | "native_iap"
  | "native_play"
  | "native_blocked";

export type CapacitorPlatformId = "ios" | "android" | "web";

/** Appended in capacitor.config.ts so SSR can tell store WebViews from Mobile Safari. */
export const NATIVE_UA_TOKEN = "GarageGeniusNative";

/** Set by the native shell client so subsequent SSR requests stay store-safe. */
export const NATIVE_STORE_SHELL_COOKIE = "gg_store_shell";

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

export function userAgentLooksNative(ua: string | null | undefined): boolean {
  return Boolean(ua && ua.includes(NATIVE_UA_TOKEN));
}

/**
 * Capacitor / in-app WKWebView often omits Mobile Safari's Version/ + Safari/
 * tokens. Treat those as store shell for SSR so Landing never paints Stripe
 * “no card” trial CTAs before JS hydrates — without breaking real Mobile Safari.
 * Android WebViews must never be classified as iOS.
 */
export function userAgentLooksLikeIosAppWebView(
  ua: string | null | undefined,
): boolean {
  if (!ua) return false;
  if (/Android/i.test(ua)) return false;
  if (userAgentLooksNative(ua)) return true;
  if (!/iPhone|iPad|iPod/i.test(ua)) return false;
  if (/Version\//i.test(ua) && /Safari\//i.test(ua)) return false;
  return /AppleWebKit/i.test(ua);
}

export function uaLooksAndroidNative(ua: string | null | undefined): boolean {
  if (!ua) return false;
  return userAgentLooksNative(ua) && /Android/i.test(ua);
}

function clientStoreShellCookiePresent(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie
    .split(";")
    .some((part) => part.trim() === `${NATIVE_STORE_SHELL_COOKIE}=1`);
}

/** `Capacitor.getPlatform()` when running in a native shell. */
export function getCapacitorPlatform(): CapacitorPlatformId {
  try {
    if (isNativeCapacitor()) {
      const raw = capacitorBridge()?.getPlatform?.()?.toLowerCase() ?? "";
      if (raw === "ios") return "ios";
      if (raw === "android") return "android";
    }
  } catch {
    /* fall through */
  }
  if (typeof navigator !== "undefined") {
    const ua = navigator.userAgent;
    if (
      /Android/i.test(ua) &&
      (userAgentLooksNative(ua) || clientStoreShellCookiePresent())
    ) {
      return "android";
    }
    if (userAgentLooksLikeIosAppWebView(ua)) return "ios";
  }
  return "web";
}

export function isNativeIos(): boolean {
  return getCapacitorPlatform() === "ios";
}

export function isNativeAndroid(): boolean {
  return getCapacitorPlatform() === "android";
}

/** Landing CTA / kicker when store shell (no Stripe “no card” web trial pitch). */
export const NATIVE_LANDING_CTA = "Start free";
export const NATIVE_LANDING_KICKER =
  "Free to start · Upgrade in-app with Apple In-App Purchase";

/** Play listing / Android WebView — Google Play Billing, no web-pay steering. */
export const NATIVE_LANDING_KICKER_ANDROID =
  "Free to start · Upgrade in-app with Google Play";

export function nativeLandingKicker(ua?: string | null): string {
  const resolvedUa =
    ua ?? (typeof navigator !== "undefined" ? navigator.userAgent : null);
  if (
    getCapacitorPlatform() === "android" ||
    uaLooksAndroidNative(resolvedUa)
  ) {
    return NATIVE_LANDING_KICKER_ANDROID;
  }
  return NATIVE_LANDING_KICKER;
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

/** Platform for store-shell SSR (legal copy, landing kicker). Web if not a store shell. */
export function storeShellPlatformFromRequest(input: {
  userAgent?: string | null;
  storeShellCookie?: string | null;
}): CapacitorPlatformId {
  const ua = input.userAgent ?? "";
  if (/Android/i.test(ua) && requestLooksStoreShell(input)) return "android";
  if (requestLooksStoreShell(input)) return "ios";
  return "web";
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
 * Hide Stripe / website checkout CTAs in store shells that must not link out.
 * Android still sells plans in-app via Google Play (`canUsePlayBilling`).
 */
export function hideStorePurchaseUi(): boolean {
  return getCapacitorPlatform() === "android";
}

/**
 * Web → Stripe Checkout / portal.
 * iOS native → StoreKit 2.
 * Android native → Google Play Billing.
 */
export function getBillingMode(): NativeBillingMode {
  const platform = getCapacitorPlatform();
  if (platform === "android") return "native_play";
  if (platform === "ios") return "native_iap";
  if (isStoreShellClient()) return "native_iap";
  return "web_stripe";
}

export function canUseStripeCheckout(): boolean {
  return getBillingMode() === "web_stripe";
}

export function canUseNativeIap(): boolean {
  return getBillingMode() === "native_iap";
}

export function canUsePlayBilling(): boolean {
  return getBillingMode() === "native_play";
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

/**
 * Android / blocked shells — no purchase CTA and no “buy on the website” steering
 * (Google Play Payments + Apple 3.1.1).
 */
export const NATIVE_NO_IAP_MESSAGE =
  "In-app purchases are not available in this version. You can keep using Garage Genius with the free features on this device.";

export const NATIVE_ACCOUNT_LIMITS_TITLE = "Upgrade your plan";

export const NATIVE_ACCOUNT_LIMITS_BODY =
  "This feature isn’t included with your current plan. Subscribe with Apple In-App Purchase to unlock Pro.";

export const NATIVE_ACCOUNT_LIMITS_BODY_ANDROID =
  "This feature isn’t included with your current plan. Subscribe with Google Play to unlock Pro.";

export const NATIVE_WEBSITE_MANAGE_HINT =
  "Purchases in this app use Apple In-App Purchase. Manage or cancel in Settings → Apple ID → Subscriptions.";

export const NATIVE_TERMS_BILLING_HEADING = "5. Accounts & billing";

export const NATIVE_TERMS_BILLING_BULLETS = [
  "In the iOS app, Pro and Multi-Car are sold as auto-renewable Apple In-App Purchases.",
  "On the website, paid plans are billed through Stripe.",
  "Account entitlements follow the signed-in Garage Genius account after Apple or Stripe verification.",
  "Deleting your account cancels access immediately; Apple subscriptions are managed in Apple ID settings.",
] as const;

/** Play store WebView — Google Play subscriptions, no website checkout. */
export const NATIVE_TERMS_BILLING_BULLETS_ANDROID = [
  "In this Android app, Pro and Multi-Car are sold as auto-renewing Google Play subscriptions.",
  "Payment is charged by Google Play. Manage or cancel in Google Play subscription settings.",
  "Account entitlements follow the signed-in Garage Genius account after Google Play verification.",
  "Deleting your account cancels access to Garage Genius data we store for you. Cancel the Play subscription separately in Google Play.",
] as const;

export const NATIVE_DELETE_ACCOUNT_BODY =
  "Permanently deletes your Garage Genius account, vehicles, chats, maintenance history, and inventory we store for you. This cannot be undone. Apple subscriptions must be canceled separately in your Apple ID settings.";

export const NATIVE_DELETE_ACCOUNT_BODY_ANDROID =
  "Permanently deletes your Garage Genius account, vehicles, chats, maintenance history, and inventory we store for you. This cannot be undone. Google Play subscriptions must be canceled separately in Google Play.";

export const NATIVE_PRIVACY_BILLING =
  "Apple App Store transaction identifiers and plan status (for iOS In-App Purchases); Stripe customer IDs and plan status on the website (card details are handled by Apple or Stripe, not stored on our servers).";

export const NATIVE_PRIVACY_BILLING_ANDROID =
  "Google Play purchase references and plan status tied to your signed-in Garage Genius account. This Android app does not collect payment card numbers.";

export const NATIVE_PRIVACY_PUSH =
  "reminder endpoint if you enable maintenance reminders.";

export const NATIVE_PRIVACY_USE =
  "Process invoices, subscriptions, account limits, and support requests.";

export const NATIVE_PRIVACY_CHOICES =
  "You can sign out, manage Apple subscriptions in your Apple ID settings, review plan details on the Garage Genius website, decline AI provider consent (DeepSeek / Kimi) until you agree, disable push reminders, limit what vehicle or photo data you enter, and delete your account.";

export const NATIVE_PRIVACY_CHOICES_ANDROID =
  "You can sign out, manage Google Play subscriptions in Google Play, decline AI provider consent (DeepSeek / Kimi) until you agree, disable push reminders, limit what vehicle or photo data you enter, and delete your account.";

export function nativeUpgradeBlockedMessage(): string {
  const mode = getBillingMode();
  if (mode === "native_iap") {
    return "Use Apple In-App Purchase in this app to change your plan.";
  }
  if (mode === "native_play") {
    return "Use Google Play in this app to change your plan.";
  }
  return NATIVE_NO_IAP_MESSAGE;
}

export function nativeAccountLimitsBody(): string {
  if (getBillingMode() === "native_play" || getBillingMode() === "native_blocked") {
    return NATIVE_ACCOUNT_LIMITS_BODY_ANDROID;
  }
  return NATIVE_ACCOUNT_LIMITS_BODY;
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
