/**
 * When Stripe, Apple, and Google Play are all valid for one user,
 * profiles.subscription_status stores the winner:
 * higher plan rank wins; same rank keeps the later expiry.
 * An expired or unpaid incoming source never replaces a live entitlement.
 */

import type { SubscriptionStatus } from "@/lib/types/subscription";

export type EntitlementSnapshot = {
  status: SubscriptionStatus | string | null | undefined;
  expiresAt?: string | null;
};

const RANK: Record<string, number> = {
  pro_heavy: 3,
  pro: 2,
  active: 2,
  trialing: 2,
};

export function entitlementRank(status: string | null | undefined): number {
  if (!status) return 0;
  return RANK[status] ?? 0;
}

function expiryMs(iso: string | null | undefined): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
}

function isLive(snap: EntitlementSnapshot, now: number): boolean {
  if (entitlementRank(snap.status) <= 0) return false;
  if (snap.status === "trialing") {
    const exp = expiryMs(snap.expiresAt);
    return exp === 0 || exp > now;
  }
  const exp = expiryMs(snap.expiresAt);
  // Missing expiry on an active paid row stays live until a source says otherwise.
  return exp === 0 || exp > now;
}

/** True when the incoming source should replace the profile entitlement. */
export function preferIncomingEntitlement(
  current: EntitlementSnapshot,
  incoming: EntitlementSnapshot,
  now = Date.now(),
): boolean {
  const incomingLive = isLive(incoming, now);
  if (!incomingLive) return false;
  if (!isLive(current, now)) return true;
  const cr = entitlementRank(current.status);
  const ir = entitlementRank(incoming.status);
  if (ir > cr) return true;
  if (ir < cr) return false;
  return expiryMs(incoming.expiresAt) >= expiryMs(current.expiresAt);
}
