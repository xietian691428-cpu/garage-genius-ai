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

export type PlayBillingDiagnosis = {
  platform: string;
  isNativeAndroid: boolean;
  billingSupported: boolean | null;
  productCount: number;
  productIds: string[];
  pluginVersion: string | null;
  rawError: string | null;
};

function isAndroidPlay(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
  } catch {
    return false;
  }
}

/** Capacitor plugin rejects often put the useful text in message and/or code. */
export function extractPlayPluginMessage(err: unknown): string {
  if (typeof err === "string") return err.trim();
  if (!err || typeof err !== "object") return String(err ?? "").trim();

  const rec = err as {
    message?: unknown;
    code?: unknown;
    errorMessage?: unknown;
    data?: { message?: unknown };
  };
  const parts = [rec.message, rec.code, rec.errorMessage, rec.data?.message]
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean);

  // Deduplicate while preserving order.
  const unique: string[] = [];
  for (const part of parts) {
    if (!unique.includes(part)) unique.push(part);
  }
  return unique.join(" · ");
}

function friendlyPlayError(err: unknown): Error {
  const msg = extractPlayPluginMessage(err);
  if (/cancel/i.test(msg) && !/cannot cancel|failed to cancel/i.test(msg)) {
    return new Error(PLAY_PURCHASE_CANCELED);
  }
  if (/already own|ITEM_ALREADY_OWNED|item already owned/i.test(msg)) {
    return new Error(PLAY_ALREADY_OWNED);
  }
  if (
    /billing unavailable|BILLING_UNAVAILABLE|Billing is not available|service disconnected|SERVICE_DISCONNECTED|feature not supported|FEATURE_NOT_SUPPORTED|Billing service unavailable|Billing setup timed out|Billing setup failed/i.test(
      msg,
    )
  ) {
    // Keep the plugin detail so closed-test devices show a real clue.
    const detail = msg && msg !== PLAY_BILLING_UNAVAILABLE ? ` (${msg})` : "";
    return new Error(`${PLAY_BILLING_UNAVAILABLE}${detail}`);
  }
  if (msg) return new Error(msg);
  return new Error(PLAY_BILLING_UNAVAILABLE);
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

/**
 * Lightweight Play Billing self-check. Safe to show in UI during closed testing.
 * Does not require a new AAB when the shell loads the remote web app.
 */
export async function diagnosePlayBilling(): Promise<PlayBillingDiagnosis> {
  const platform = (() => {
    try {
      return Capacitor.getPlatform();
    } catch {
      return "unknown";
    }
  })();
  const isNativeAndroid = isAndroidPlay();
  const out: PlayBillingDiagnosis = {
    platform,
    isNativeAndroid,
    billingSupported: null,
    productCount: 0,
    productIds: [],
    pluginVersion: null,
    rawError: null,
  };
  if (!isNativeAndroid) {
    out.rawError = "Not running inside the Android Capacitor shell.";
    return out;
  }

  try {
    const supported = await NativePurchases.isBillingSupported();
    out.billingSupported = Boolean(supported?.isBillingSupported);
  } catch (err) {
    out.billingSupported = false;
    out.rawError = extractPlayPluginMessage(err) || "isBillingSupported failed";
  }

  try {
    const version = await NativePurchases.getPluginVersion();
    out.pluginVersion = version?.version ?? null;
  } catch {
    /* optional */
  }

  try {
    const products = await fetchPlayProducts();
    out.productCount = products.length;
    out.productIds = products
      .map((p) => p.planIdentifier?.trim() || p.identifier?.trim() || "")
      .filter(Boolean);
  } catch (err) {
    const msg = extractPlayPluginMessage(err);
    out.rawError = out.rawError ? `${out.rawError} · ${msg}` : msg;
  }

  return out;
}

function formatDiagnosis(d: PlayBillingDiagnosis): string {
  return [
    `supported=${String(d.billingSupported)}`,
    `products=${d.productCount}`,
    d.productIds.length ? `ids=${d.productIds.slice(0, 4).join(",")}` : null,
    d.pluginVersion ? `plugin=${d.pluginVersion}` : null,
    d.rawError ? `err=${d.rawError}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

async function assertPlayBillingReady(): Promise<void> {
  const diagnosis = await diagnosePlayBilling();
  console.info("[play] diagnose", diagnosis);
  if (diagnosis.billingSupported === false) {
    throw new Error(
      `${PLAY_BILLING_UNAVAILABLE} Detail: ${formatDiagnosis(diagnosis)}. Install this build from the Play closed-testing link, accept the tester invite with the Google account on this phone, and open Play Store once.`,
    );
  }
  if (diagnosis.productCount === 0) {
    throw new Error(
      `Google Play returned no subscription products. Detail: ${formatDiagnosis(diagnosis)}. Confirm the four SKUs are Active in Play Console and attached to this app, with base plans monthly/yearly.`,
    );
  }
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

/** Send every local Play subscription token to the server (no Store UI). */
async function syncLocalPlayPurchasesToServer(): Promise<number> {
  const { purchases } = await NativePurchases.getPurchases({
    productType: PURCHASE_TYPE.SUBS,
  });

  let synced = 0;
  for (const purchase of purchases ?? []) {
    try {
      await syncTransactionToServer(purchase as Transaction);
      synced += 1;
    } catch (err) {
      console.warn(
        "[play] sync skipped",
        err instanceof Error ? err.name : "error",
      );
    }
  }
  return synced;
}

/**
 * Cold-start / resume re-verify. Does not call Play restore UI — only posts
 * tokens already on the device. Never throws; safe from layout effects.
 */
export async function syncPlayPurchasesQuietly(): Promise<{ synced: number }> {
  if (!isAndroidPlay()) return { synced: 0 };

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return { synced: 0 };

  try {
    const synced = await syncLocalPlayPurchasesToServer();
    return { synced };
  } catch (err) {
    console.warn(
      "[play] quiet sync failed",
      err instanceof Error ? err.name : "error",
    );
    return { synced: 0 };
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

  try {
    await assertPlayBillingReady();
  } catch (err) {
    throw friendlyPlayError(err);
  }

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
      "Google Play purchase timed out. Check Play Store login and try again.",
    );
  } catch (err) {
    let detail = "";
    try {
      detail = ` Detail: ${formatDiagnosis(await diagnosePlayBilling())}.`;
    } catch {
      /* diagnosis is best-effort */
    }
    throw new Error(`${friendlyPlayError(err).message}${detail}`);
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

  const synced = await syncLocalPlayPurchasesToServer();
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
