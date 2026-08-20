/**
 * Client StoreKit 2 bridge via @capgo/native-purchases.
 * Used only when getBillingMode() === "native_iap" (iOS Capacitor).
 */

import { Capacitor } from "@capacitor/core";
import {
  NativePurchases,
  PURCHASE_TYPE,
  type Product,
  type Transaction,
} from "@capgo/native-purchases";
import { supabase } from "@/lib/supabase";
import {
  ALL_APPLE_PRODUCT_IDS,
  appleProductIdForSelection,
  APPLE_MANAGE_SUBSCRIPTIONS_URL,
} from "@/lib/apple-iap-products";
import type {
  BillingInterval,
  CheckoutSelection,
  PaidPlan,
} from "@/lib/types/subscription";
import { Browser } from "@capacitor/browser";
import { withTimeout } from "@/lib/auth-timeout";
import { BILLING_IAP_SANDBOX_HUNG } from "@/lib/billing-errors";

/** StoreKit purchase sheet + Sandbox sign-in can hang forever on Simulator. */
const IAP_PURCHASE_TIMEOUT_MS = 120_000;

function jwsFromTransaction(transaction: Transaction): string | undefined {
  const rec = transaction as Transaction & {
    jwsRepresentation?: string;
    receipt?: string;
  };
  const jws = rec.jwsRepresentation?.trim() || rec.receipt?.trim();
  return jws || undefined;
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

export function isNativeIapAvailable(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
  } catch {
    return false;
  }
}

export async function fetchAppleProducts(): Promise<Product[]> {
  const { products } = await NativePurchases.getProducts({
    productIdentifiers: ALL_APPLE_PRODUCT_IDS,
    productType: PURCHASE_TYPE.SUBS,
  });
  return products ?? [];
}

async function syncTransactionToServer(
  transaction: Transaction,
): Promise<void> {
  const jws = jwsFromTransaction(transaction);
  if (!jws) {
    throw new Error(
      "Purchase completed but no signed transaction was returned. Try Restore purchases.",
    );
  }

  const res = await fetch("/api/apple/verify", {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({
      signedTransaction: jws,
    }),
  });
  const data = (await res.json()) as { error?: string };
  if (!res.ok) {
    throw new Error(data.error || "Could not verify purchase with server.");
  }
}

export async function purchaseApplePlan(
  selection: CheckoutSelection,
): Promise<void> {
  if (!isNativeIapAvailable()) {
    throw new Error("In-app purchases are only available in the iOS app.");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) throw new Error("Sign in to purchase.");

  const productIdentifier = appleProductIdForSelection(selection);
  const transaction = await withTimeout(
    NativePurchases.purchaseProduct({
      productIdentifier,
      productType: PURCHASE_TYPE.SUBS,
      appAccountToken: user.id,
    }),
    IAP_PURCHASE_TIMEOUT_MS,
    BILLING_IAP_SANDBOX_HUNG,
  );

  await syncTransactionToServer(transaction);
}

export async function purchaseApplePlanByIds(
  plan: PaidPlan,
  interval: BillingInterval,
): Promise<void> {
  return purchaseApplePlan({ plan, interval });
}

export async function restoreApplePurchases(): Promise<{ synced: number }> {
  if (!isNativeIapAvailable()) {
    throw new Error("Restore is only available in the iOS app.");
  }

  await NativePurchases.restorePurchases();
  const { purchases } = await NativePurchases.getPurchases({
    productType: PURCHASE_TYPE.SUBS,
  });

  let synced = 0;
  for (const p of purchases ?? []) {
    try {
      await syncTransactionToServer(p as Transaction);
      synced += 1;
    } catch (err) {
      console.warn("[iap] restore sync skipped", err);
    }
  }
  return { synced };
}

/** Opens Apple’s subscription management (StoreKit / system UI when possible). */
export async function openAppleManageSubscriptions(): Promise<void> {
  try {
    await NativePurchases.manageSubscriptions();
  } catch {
    if (Capacitor.isNativePlatform()) {
      await Browser.open({ url: APPLE_MANAGE_SUBSCRIPTIONS_URL });
    } else {
      window.open(APPLE_MANAGE_SUBSCRIPTIONS_URL, "_blank", "noopener");
    }
  }
}
