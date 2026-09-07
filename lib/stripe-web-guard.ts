/**
 * Stripe Checkout / Portal / recharge are website-only.
 * App Store 3.1.1 and Google Play Payments: do not start card checkout
 * from a store WebView for digital Pro / tokens.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  NATIVE_STORE_SHELL_COOKIE,
  requestLooksStoreShell,
} from "@/lib/native-platform";

export const STRIPE_STORE_SHELL_BLOCKED_CODE = "store_shell_stripe_blocked";

export const STRIPE_STORE_SHELL_BLOCKED =
  "Card checkout is not available in the store app.";

export function stripeBlockedForStoreRequest(req: NextRequest): boolean {
  return requestLooksStoreShell({
    userAgent: req.headers.get("user-agent"),
    storeShellCookie: req.cookies.get(NATIVE_STORE_SHELL_COOKIE)?.value ?? null,
  });
}

export function stripeStoreShellBlockedResponse(): {
  error: string;
  code: string;
} {
  return {
    error: STRIPE_STORE_SHELL_BLOCKED,
    code: STRIPE_STORE_SHELL_BLOCKED_CODE,
  };
}

/** 403 JSON for Checkout / Portal / recharge called from a store WebView. */
export function stripeStoreShellBlockedJson(): NextResponse {
  return NextResponse.json(stripeStoreShellBlockedResponse(), { status: 403 });
}
