/**
 * Decide whether a Stripe, Apple, or Google Play update may replace
 * profiles.subscription_status. The winner is the live row with the higher
 * plan, then the later expiry. A dead update only clears the profile when
 * that same source currently owns it.
 */

import { createSupabaseAdmin } from "@/lib/supabase-admin";
import {
  preferIncomingEntitlement,
  type EntitlementSnapshot,
} from "@/lib/billing-entitlement-merge";

export type BillingSource = "stripe" | "apple" | "google_play";

function isIncomingLive(incoming: EntitlementSnapshot, now: number): boolean {
  return preferIncomingEntitlement(
    { status: "free", expiresAt: null },
    incoming,
    now,
  );
}

export function shouldWriteEntitlement(
  current: EntitlementSnapshot & { source?: string | null },
  incoming: EntitlementSnapshot & { source: BillingSource },
  now = Date.now(),
): boolean {
  const sameSource = current.source === incoming.source;
  if (!isIncomingLive(incoming, now)) return sameSource;
  return preferIncomingEntitlement(current, incoming, now);
}

export async function shouldCommitEntitlement(
  userId: string,
  incoming: EntitlementSnapshot & { source: BillingSource },
  now = Date.now(),
): Promise<boolean> {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("profiles")
    .select("subscription_status, current_period_end, billing_provider")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return true;
  return shouldWriteEntitlement(
    {
      status: data.subscription_status as string | null,
      expiresAt: data.current_period_end as string | null,
      source: data.billing_provider as string | null,
    },
    incoming,
    now,
  );
}
