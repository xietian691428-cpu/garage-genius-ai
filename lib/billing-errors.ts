/**
 * Map Stripe / infra failures to short customer-facing copy.
 * Never surface API keys, price IDs, request IDs, or raw Stripe text in the UI.
 */

export const BILLING_CHECKOUT_UNAVAILABLE =
  "Checkout is temporarily unavailable. Please try again in a few minutes, or contact support if this keeps happening.";

export const BILLING_PORTAL_UNAVAILABLE =
  "We couldn't open billing right now. Please try again in a few minutes.";

export const BILLING_RECHARGE_UNAVAILABLE =
  "Token top-up is temporarily unavailable. Please try again in a few minutes.";

export const BILLING_IAP_UNAVAILABLE =
  "Apple In-App Purchase couldn’t complete. Try Restore purchases, or try again in a few minutes.";

export const BILLING_IAP_SANDBOX_HUNG =
  "The App Store didn’t finish this purchase. Sandbox IAP does not complete in the iOS Simulator — use a physical iPhone or iPad. On a device, add the Sandbox account in Settings → App Store first, then tap Subscribe again.";

/** Intentional product messages that are safe to show as-is. */
const SAFE_EXACT = new Set([
  "Sign in to manage your subscription.",
  "Sign in required to buy tokens.",
  "Unauthorized",
  "No Stripe customer on file. Subscribe first.",
  "Stripe did not return a checkout URL.",
  "No active Apple subscriptions found for this Apple ID.",
]);

const SAFE_PATTERNS: RegExp[] = [
  /^Sign in\b/i,
  /^Verify your email\b/i,
  /Checkout is temporarily unavailable/i,
  /Token top-up is temporarily unavailable/i,
  /couldn't open billing/i,
  /unavailable in the store app/i,
  /In-App Purchase/i,
  /Restore purchases/i,
  /Sandbox IAP/i,
  /physical iPhone or iPad/i,
  /Payments are disabled/i,
  /QA unlock/i,
  /email before upgrading/i,
  /Subscribe first/i,
];

/** Looks like Stripe SDK / secret leakage — never show to customers. */
function looksLikeInternalBillingError(message: string): boolean {
  return /invalid api key|no such (price|customer|subscription|product)|resource_missing|authentication.?error|api[\s_-]?key|price_[A-Za-z0-9]|cus_[A-Za-z0-9]|sub_[A-Za-z0-9]|sk_(live|test)_|pk_(live|test)_|whsec_|req_[A-Za-z0-9]|stripe\.com|raw request body|idempotency|card_error|StripeInvalidRequest|Missing STRIPE_/i.test(
    message,
  );
}

function extractMessage(err: unknown): string {
  if (typeof err === "string") return err.trim();
  if (err instanceof Error) return err.message.trim();
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === "string") return m.trim();
  }
  return "";
}

export function isSafeUserBillingMessage(message: string): boolean {
  const msg = message.trim();
  if (!msg) return false;
  if (looksLikeInternalBillingError(msg)) return false;
  if (SAFE_EXACT.has(msg)) return true;
  return SAFE_PATTERNS.some((re) => re.test(msg));
}

export function isPurchaseCancelled(err: unknown): boolean {
  const raw = extractMessage(err);
  if (!raw) return false;
  if (/cannot cancel|failed to cancel/i.test(raw)) return false;
  return /^(user cancelled|purchase cancelled\.?|sign in cancelled\.?)$/i.test(
    raw,
  );
}

export function toUserFacingBillingError(
  err: unknown,
  fallback: string = BILLING_CHECKOUT_UNAVAILABLE,
): string {
  const raw = extractMessage(err);
  if (raw && isSafeUserBillingMessage(raw)) return raw;
  return fallback;
}
