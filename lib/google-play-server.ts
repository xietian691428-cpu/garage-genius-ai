/**
 * Google Play subscription verification (Android Publisher API subscriptionsv2).
 * Grants the same profiles.subscription_status fields as Apple IAP / Stripe.
 * Never logs the full purchase token.
 */

import { createHash, createSign } from "node:crypto";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { shouldCommitEntitlement } from "@/lib/billing-entitlement-commit";
import {
  GOOGLE_PLAY_PACKAGE_NAME,
  planFromGoogleProductId,
  subscriptionStatusFromGoogleProduct,
} from "@/lib/google-play-products";
import type { SubscriptionStatus } from "@/lib/types/subscription";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const PUBLISHER_SCOPE = "https://www.googleapis.com/auth/androidpublisher";

const ENTITLED_STATES = new Set([
  "SUBSCRIPTION_STATE_ACTIVE",
  "SUBSCRIPTION_STATE_CANCELED",
  "SUBSCRIPTION_STATE_IN_GRACE_PERIOD",
]);

export class GooglePlayVerifyError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "GooglePlayVerifyError";
    this.status = status;
  }
}

export type PlayLineItem = {
  productId?: string;
  expiryTime?: string;
};

export type PlaySubscriptionV2 = {
  subscriptionState?: string;
  latestOrderId?: string;
  acknowledgementState?: string;
  lineItems?: PlayLineItem[];
};

export type PlayEntitlementRead = {
  entitled: boolean;
  plan: "pro" | "pro_heavy" | null;
  productId: string;
  expiresAt: string | null;
  state: string;
  orderId: string | null;
};

type ServiceAccount = { client_email: string; private_key: string };

let cachedToken: { accessToken: string; exp: number } | null = null;

export function hashUserId(userId: string): string {
  return createHash("sha256").update(userId).digest("hex").slice(0, 12);
}

export function purchaseTokenRef(token: string): string {
  if (!token) return "(empty)";
  return `…${token.slice(-6)}`;
}

export function assertPurchaseTokenOwner(
  existingUserId: string | null | undefined,
  currentUserId: string,
): void {
  if (existingUserId && existingUserId !== currentUserId) {
    throw new GooglePlayVerifyError(
      "This Google Play purchase is already linked to another Garage Genius account.",
      409,
    );
  }
}

export function readPlayEntitlement(
  sub: PlaySubscriptionV2,
  expectedProductId: string,
  now = Date.now(),
): PlayEntitlementRead {
  const item =
    sub.lineItems?.find((line) => line.productId === expectedProductId) ??
    null;
  const productId = item?.productId ?? "";
  const plan = planFromGoogleProductId(productId);
  const expiresAt = item?.expiryTime ?? null;
  const expMs = expiresAt ? new Date(expiresAt).getTime() : 0;
  const state = sub.subscriptionState ?? "";
  const entitled = Boolean(
    plan &&
      productId === expectedProductId &&
      ENTITLED_STATES.has(state) &&
      Number.isFinite(expMs) &&
      expMs > now,
  );
  return {
    entitled,
    plan,
    productId,
    expiresAt,
    state,
    orderId: sub.latestOrderId ?? null,
  };
}

function loadServiceAccount(): ServiceAccount {
  const raw = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) {
    throw new GooglePlayVerifyError(
      "Google Play billing is not configured.",
      503,
    );
  }
  let parsed: { client_email?: string; private_key?: string };
  try {
    parsed = JSON.parse(raw) as { client_email?: string; private_key?: string };
  } catch {
    throw new GooglePlayVerifyError(
      "Google Play billing is not configured.",
      503,
    );
  }
  if (!parsed.client_email || !parsed.private_key) {
    throw new GooglePlayVerifyError(
      "Google Play billing is not configured.",
      503,
    );
  }
  return {
    client_email: parsed.client_email,
    private_key: parsed.private_key.replace(/\\n/g, "\n"),
  };
}

function base64url(input: string | Buffer): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

async function accessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp > now + 60) return cachedToken.accessToken;

  const sa = loadServiceAccount();
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: PUBLISHER_SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    }),
  );
  const sign = createSign("RSA-SHA256");
  sign.update(`${header}.${claim}`);
  sign.end();
  const jwt = `${header}.${claim}.${base64url(sign.sign(sa.private_key))}`;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    console.error("[google-play] token exchange failed", res.status);
    throw new GooglePlayVerifyError(
      "Could not verify this purchase with Google Play.",
      502,
    );
  }
  const body = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) {
    throw new GooglePlayVerifyError(
      "Could not verify this purchase with Google Play.",
      502,
    );
  }
  cachedToken = {
    accessToken: body.access_token,
    exp: now + (body.expires_in ?? 3600),
  };
  return body.access_token;
}

export async function fetchPlaySubscription(opts: {
  packageName: string;
  purchaseToken: string;
}): Promise<PlaySubscriptionV2> {
  const token = await accessToken();
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(opts.packageName)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(opts.purchaseToken)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404 || res.status === 400) {
    throw new GooglePlayVerifyError(
      "Google Play could not find this subscription.",
      400,
    );
  }
  if (!res.ok) {
    console.error(
      "[google-play] subscriptionsv2 failed",
      res.status,
      purchaseTokenRef(opts.purchaseToken),
    );
    throw new GooglePlayVerifyError(
      "Could not verify this purchase with Google Play.",
      502,
    );
  }
  return (await res.json()) as PlaySubscriptionV2;
}

async function acknowledgeIfNeeded(opts: {
  packageName: string;
  productId: string;
  purchaseToken: string;
  acknowledgementState?: string;
}): Promise<void> {
  if (opts.acknowledgementState === "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED") return;
  try {
    const token = await accessToken();
    const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(opts.packageName)}/purchases/subscriptions/${encodeURIComponent(opts.productId)}/tokens/${encodeURIComponent(opts.purchaseToken)}:acknowledge`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    if (!res.ok && res.status !== 400) {
      console.warn(
        "[google-play] acknowledge failed",
        res.status,
        purchaseTokenRef(opts.purchaseToken),
      );
    }
  } catch (err) {
    console.warn("[google-play] acknowledge skipped", err instanceof Error ? err.name : "error");
  }
}

export async function applyGooglePlayPurchase(opts: {
  userId: string;
  purchaseToken: string;
  productId: string;
  packageName: string;
  orderId?: string | null;
}): Promise<{ status: SubscriptionStatus; expiresAt: string | null; applied: boolean }> {
  const purchaseToken = opts.purchaseToken.trim();
  const productId = opts.productId.trim();
  const packageName = opts.packageName.trim();

  if (!purchaseToken || !productId || !packageName) {
    throw new GooglePlayVerifyError(
      "purchaseToken, productId, and packageName are required.",
      400,
    );
  }
  if (packageName !== GOOGLE_PLAY_PACKAGE_NAME) {
    throw new GooglePlayVerifyError("Package name does not match this app.", 400);
  }
  if (!planFromGoogleProductId(productId)) {
    throw new GooglePlayVerifyError(`Unsupported product: ${productId}`, 400);
  }

  const admin = createSupabaseAdmin();
  const { data: existing, error: existingError } = await admin
    .from("google_play_purchases")
    .select("user_id")
    .eq("purchase_token", purchaseToken)
    .maybeSingle();
  if (existingError) {
    throw new GooglePlayVerifyError(
      "Could not check this purchase. Try again in a few minutes.",
      500,
    );
  }
  assertPurchaseTokenOwner(existing?.user_id as string | undefined, opts.userId);

  const remote = await fetchPlaySubscription({ packageName, purchaseToken });
  const read = readPlayEntitlement(remote, productId);
  if (opts.orderId && read.orderId && opts.orderId !== read.orderId) {
    throw new GooglePlayVerifyError("Order id does not match Google Play.", 400);
  }

  const planStatus = subscriptionStatusFromGoogleProduct(productId);
  const nowIso = new Date().toISOString();
  const { error: upsertError } = await admin.from("google_play_purchases").upsert(
    {
      purchase_token: purchaseToken,
      user_id: opts.userId,
      product_id: productId,
      order_id: read.orderId ?? opts.orderId ?? null,
      package_name: packageName,
      expires_at: read.expiresAt,
      subscription_state: read.state || null,
      plan: read.plan,
      updated_at: nowIso,
    },
    { onConflict: "purchase_token" },
  );
  if (upsertError) {
    const dup = /duplicate|unique/i.test(upsertError.message);
    throw new GooglePlayVerifyError(
      dup
        ? "This Google Play purchase is already linked to another Garage Genius account."
        : "Could not save this purchase. Try again in a few minutes.",
      dup ? 409 : 500,
    );
  }

  if (!read.entitled || !read.plan) {
    console.info(
      "[google-play] not entitled",
      hashUserId(opts.userId),
      productId,
      read.state,
      purchaseTokenRef(purchaseToken),
    );
    throw new GooglePlayVerifyError(
      "This Google Play subscription is not active.",
      402,
    );
  }

  await acknowledgeIfNeeded({
    packageName,
    productId,
    purchaseToken,
    acknowledgementState: remote.acknowledgementState,
  });

  const applied = await shouldCommitEntitlement(opts.userId, {
    status: planStatus,
    expiresAt: read.expiresAt,
    source: "google_play",
  });

  if (applied) {
    const { error } = await admin
      .from("profiles")
      .update({
        billing_provider: "google_play",
        google_purchase_token: purchaseToken,
        google_product_id: productId,
        google_order_id: read.orderId ?? opts.orderId ?? null,
        subscription_status: planStatus,
        current_period_end: read.expiresAt,
      })
      .eq("id", opts.userId);
    if (error) {
      throw new GooglePlayVerifyError(
        "Could not sync this subscription to your account.",
        500,
      );
    }
  }

  console.info(
    "[google-play] verified",
    hashUserId(opts.userId),
    productId,
    applied ? "applied" : "kept-higher",
    purchaseTokenRef(purchaseToken),
  );

  return { status: planStatus, expiresAt: read.expiresAt, applied };
}
