/**
 * Google Play Billing bridge via @capgo/native-purchases.
 * Used only when getBillingMode() === "native_play" (Android Capacitor).
 * Purchase success is not an entitlement — the server verify response is.
 */

import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import {
  NativePurchases,
  PURCHASE_TYPE,
  type Product,
  type Transaction,
} from "@capgo/native-purchases";
import { supabase } from "@/lib/supabase";
import {
  ALL_GOOGLE_PLAY_PRODUCT_IDS,
  GOOGLE_PLAY_MANAGE_SUBSCRIPTIONS_URL,
  GOOGLE_PLAY_PACKAGE_NAME,
  googleBasePlanId,
  googleProductIdForSelection,
} from "@/lib/google-play-products";
import type { CheckoutSelection } from "@/lib/types/subscription";
import { withTimeout } from "@/lib/auth-timeout";

const PLAY_PURCHASE_TIMEOUT_MS = 120_000;

export const PLAY_BILLING_UNAVAILABLE =
  "Google Play Billing isn’t available on this device right now. You can keep using the free features.";

export const PLAY_ALREADY_OWNED =
  "You already own this subscription. Tap Restore purchases to sync it to this account.";

export const PLAY_PURCHASE_CANCELED = "Purchase canceled.";

export const PLAY_PENDING =
  "Google Play is still processing this payment. It will sync after the payment completes. You can tap Restore purchases later.";

function isAndroidPlay(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
  } catch {
    return false;
  }
}

function friendlyPlayError(err: unknown): Error {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  if (/cancel/i.test(msg) && !/cannot cancel|failed to cancel/i.test(msg)) {
    return new Error(PLAY_PURCHASE_CANCELED);
  }
  if (/already own|ITEM_ALREADY_OWNED|item already owned/i.test(msg)) {
    return new Error(PLAY_ALREADY_OWNED);
  }
  if (
    /billing unavailable|BILLING_UNAVAILABLE|service disconnected|not supported|feature not supported/i.test(
      msg,
    )
  ) {
    return new Error(PLAY_BILLING_UNAVAILABLE);
  }
  return err instanceof Error ? err : new Error(PLAY_BILLING_UNAVAILABLE);
}

async function authHeaders(): Promise<HeadersInit> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("Sign in to manage your subscription.");
  }
  return {
    Authorization: `Bearer ${session.access_token}`,
    "Content-Type": "application/json",
  };
}

export async function fetchPlayProducts(): Promise<Product[]> {
  if (!isAndroidPlay()) return [];
  const { products } = await NativePurchases.getProducts({
    productIdentifiers: ALL_GOOGLE_PLAY_PRODUCT_IDS,
    productType: PURCHASE_TYPE.SUBS,
  });
  return products ?? [];
}

async function syncTransactionToServer(transaction: Transaction): Promise<void> {
  const purchaseToken = transaction.purchaseToken?.trim();
  const productId = transaction.productIdentifier?.trim();
  if (!purchaseToken || !productId) {
    throw new Error(
      "Purchase completed but Google Play did not return a token. Try Restore purchases.",
    );
  }
  if (transaction.purchaseState === "0") {
    throw new Error(PLAY_PENDING);
  }

  const res = await fetch("/api/google/play/verify", {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({
      purchaseToken,
      productId,
      packageName: GOOGLE_PLAY_PACKAGE_NAME,
      orderId: transaction.orderId,
    }),
  });
  const data = (await res.json()) as { error?: string };
  if (!res.ok) {
    throw new Error(data.error || "Could not verify purchase with server.");
  }
}

export async function purchasePlayPlan(selection: CheckoutSelection): Promise<void> {
  if (!isAndroidPlay()) {
    throw new Error("Google Play Billing is only available in the Android app.");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) throw new Error("Sign in to purchase.");

  const productIdentifier = googleProductIdForSelection(selection);
  let transaction: Transaction;
  try {
    transaction = await withTimeout(
      NativePurchases.purchaseProduct({
        productIdentifier,
        planIdentifier: googleBasePlanId(selection.interval),
        productType: PURCHASE_TYPE.SUBS,
        appAccountToken: user.id,
      }),
      PLAY_PURCHASE_TIMEOUT_MS,
      PLAY_BILLING_UNAVAILABLE,
    );
  } catch (err) {
    throw friendlyPlayError(err);
  }

  await syncTransactionToServer(transaction);
}

export async function restorePlayPurchases(): Promise<{ synced: number }> {
  if (!isAndroidPlay()) {
    throw new Error("Restore is only available in the Android app.");
  }

  try {
    await NativePurchases.restorePurchases();
  } catch (err) {
    throw friendlyPlayError(err);
  }

  const { purchases } = await NativePurchases.getPurchases({
    productType: PURCHASE_TYPE.SUBS,
  });

  let synced = 0;
  for (const purchase of purchases ?? []) {
    try {
      await syncTransactionToServer(purchase as Transaction);
      synced += 1;
    } catch (err) {
      console.warn("[play] restore sync skipped", err instanceof Error ? err.name : "error");
    }
  }
  return { synced };
}

/** Opens Google Play subscription management — not a website checkout. */
export async function openPlayManageSubscriptions(): Promise<void> {
  try {
    await NativePurchases.manageSubscriptions();
  } catch {
    if (Capacitor.isNativePlatform()) {
      await Browser.open({ url: GOOGLE_PLAY_MANAGE_SUBSCRIPTIONS_URL });
    } else {
      window.open(GOOGLE_PLAY_MANAGE_SUBSCRIPTIONS_URL, "_blank", "noopener");
    }
  }
}
