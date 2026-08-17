/**
 * Server-side Apple IAP verification + profile entitlement sync.
 * Writes the same subscription_status / current_period_end fields as Stripe.
 */

import {
  Environment,
  SignedDataVerifier,
  type JWSTransactionDecodedPayload,
  type ResponseBodyV2DecodedPayload,
} from "@apple/app-store-server-library";
import { appleRootCertificates } from "@/lib/apple-root-certs";
import {
  APPLE_BUNDLE_ID,
  planFromAppleProductId,
  subscriptionStatusFromAppleProduct,
} from "@/lib/apple-iap-products";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import type { SubscriptionStatus } from "@/lib/types/subscription";

export type AppleEnvironmentName = "Sandbox" | "Production";

function appAppleId(): number | undefined {
  const raw = process.env.APPLE_APP_APPLE_ID?.trim();
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function verifierFor(env: Environment): SignedDataVerifier {
  const appleId = appAppleId();
  // Production requires appAppleId; Sandbox does not.
  if (env === Environment.PRODUCTION && appleId == null) {
    throw new Error(
      "APPLE_APP_APPLE_ID is required to verify Production App Store transactions.",
    );
  }
  return new SignedDataVerifier(
    appleRootCertificates(),
    true,
    env,
    APPLE_BUNDLE_ID,
    appleId,
  );
}

/** Try Sandbox then Production (or reverse) so TestFlight + prod both work. */
export async function verifySignedTransaction(
  signedTransaction: string,
  prefer: AppleEnvironmentName = "Production",
): Promise<{
  payload: JWSTransactionDecodedPayload;
  environment: AppleEnvironmentName;
}> {
  const order: Environment[] =
    prefer === "Sandbox"
      ? [Environment.SANDBOX, Environment.PRODUCTION]
      : [Environment.PRODUCTION, Environment.SANDBOX];

  let lastErr: unknown;
  for (const env of order) {
    try {
      const payload = await verifierFor(env).verifyAndDecodeTransaction(
        signedTransaction,
      );
      return {
        payload,
        environment:
          env === Environment.SANDBOX ? "Sandbox" : "Production",
      };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error("Apple transaction verification failed.");
}

export async function verifySignedNotification(
  signedPayload: string,
): Promise<{
  notification: ResponseBodyV2DecodedPayload;
  environment: AppleEnvironmentName;
}> {
  const order = [Environment.PRODUCTION, Environment.SANDBOX];
  let lastErr: unknown;
  for (const env of order) {
    try {
      const notification = await verifierFor(env).verifyAndDecodeNotification(
        signedPayload,
      );
      return {
        notification,
        environment:
          env === Environment.SANDBOX ? "Sandbox" : "Production",
      };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error("Apple notification verification failed.");
}

function msToIso(ms: number | undefined): string | null {
  if (ms == null || !Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

function isOfferTrial(payload: JWSTransactionDecodedPayload): boolean {
  const type = String(payload.offerType ?? "");
  // 1 = introductory offer (often free trial in ASC)
  return type === "1" || type === "INTRODUCTORY_OFFER";
}

function statusFromPayload(
  payload: JWSTransactionDecodedPayload,
  revoked: boolean,
): SubscriptionStatus {
  if (revoked || payload.revocationDate) return "canceled";
  const productId = payload.productId ?? "";
  const expires = payload.expiresDate;
  if (expires != null && expires < Date.now()) return "canceled";
  return subscriptionStatusFromAppleProduct(productId, {
    isTrialing: isOfferTrial(payload),
  });
}

export async function applyAppleTransactionToProfile(opts: {
  userId: string;
  payload: JWSTransactionDecodedPayload;
  environment: AppleEnvironmentName;
  /** When true, clear paid entitlement (refund / expire / revoke). */
  revoked?: boolean;
}): Promise<{ status: SubscriptionStatus }> {
  const { userId, payload, environment } = opts;
  const productId = payload.productId;
  if (!productId || !planFromAppleProductId(productId)) {
    throw new Error(`Unknown Apple product: ${productId ?? "(missing)"}`);
  }

  const originalTransactionId = payload.originalTransactionId;
  const transactionId = payload.transactionId;
  if (!originalTransactionId || !transactionId) {
    throw new Error("Apple transaction missing ids.");
  }

  const revoked = Boolean(opts.revoked || payload.revocationDate);
  const status = statusFromPayload(payload, revoked);
  const periodEnd = msToIso(payload.expiresDate);
  const admin = createSupabaseAdmin();

  await admin.from("apple_transactions").upsert(
    {
      user_id: userId,
      original_transaction_id: originalTransactionId,
      transaction_id: transactionId,
      product_id: productId,
      environment,
      expires_date: periodEnd,
      revoked,
      raw_payload: payload as unknown as Record<string, unknown>,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "transaction_id" },
  );

  const patch: Record<string, unknown> = {
    billing_provider: "apple",
    apple_original_transaction_id: originalTransactionId,
    apple_product_id: productId,
    apple_environment: environment,
    subscription_status: status,
    current_period_end: periodEnd,
    stripe_subscription_id: null,
  };

  if (status === "trialing") {
    patch.trial_ends_at = periodEnd;
  }

  if (status === "canceled" || status === "free") {
    patch.subscription_status = "canceled";
  }

  const { error } = await admin.from("profiles").update(patch).eq("id", userId);
  if (error) {
    throw new Error(`Failed to sync Apple entitlement: ${error.message}`);
  }

  return { status };
}

/** Resolve user from appAccountToken (UUID) or existing originalTransactionId. */
export async function resolveUserIdForApplePayload(
  payload: JWSTransactionDecodedPayload,
  fallbackUserId?: string | null,
): Promise<string | null> {
  const token = payload.appAccountToken?.trim();
  if (token && /^[0-9a-f-]{36}$/i.test(token)) {
    return token.toLowerCase();
  }
  if (fallbackUserId) return fallbackUserId;

  const original = payload.originalTransactionId;
  if (!original) return null;
  const admin = createSupabaseAdmin();
  const { data } = await admin
    .from("profiles")
    .select("id")
    .eq("apple_original_transaction_id", original)
    .maybeSingle();
  return data?.id ?? null;
}

export async function handleAppleNotificationPayload(
  signedPayload: string,
): Promise<void> {
  const { notification, environment } =
    await verifySignedNotification(signedPayload);
  const signedTx = notification.data?.signedTransactionInfo;
  if (!signedTx) {
    console.warn(
      "[apple-iap] notification without transaction",
      notification.notificationType,
    );
    return;
  }

  const payload = await verifierFor(
    environment === "Sandbox" ? Environment.SANDBOX : Environment.PRODUCTION,
  ).verifyAndDecodeTransaction(signedTx);

  const userId = await resolveUserIdForApplePayload(payload);
  if (!userId) {
    console.warn(
      "[apple-iap] notification: no user for originalTransactionId",
      payload.originalTransactionId,
    );
    return;
  }

  const type = String(notification.notificationType ?? "");
  const revoke =
    /REFUND|REVOKE|EXPIRED|GRACE_PERIOD_EXPIRED|DID_FAIL_TO_RENEW/i.test(type);

  await applyAppleTransactionToProfile({
    userId,
    payload,
    environment,
    revoked: revoke,
  });
}
