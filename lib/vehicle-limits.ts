/**
 * Garage vehicle count limits — server + pure helpers.
 * Free 1 · Pro / Trial 5 · Heavy 10 (PLAN_ENTITLEMENTS.maxVehicles).
 */

import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { resolveSubscription } from "@/lib/subscription";
import { isQaUnlockEnabled } from "@/lib/qa-mode";
import {
  entitlementsForTier,
  type SubscriptionTier,
} from "@/lib/types/subscription";

export const VEHICLE_LIMIT_CODE = "VEHICLE_LIMIT_REACHED";

export class VehicleLimitError extends Error {
  status = 403;
  code = VEHICLE_LIMIT_CODE;
  maxVehicles: number;
  currentCount: number;

  constructor(maxVehicles: number, currentCount: number) {
    super(
      `Plan limit: ${maxVehicles} vehicle${maxVehicles === 1 ? "" : "s"}. Upgrade for more.`,
    );
    this.name = "VehicleLimitError";
    this.maxVehicles = maxVehicles;
    this.currentCount = currentCount;
  }
}

export type VehicleQuota = {
  tier: SubscriptionTier;
  maxVehicles: number;
  currentCount: number;
  remaining: number;
  canAdd: boolean;
};

export function maxVehiclesForTier(tier: SubscriptionTier): number {
  return entitlementsForTier(tier).maxVehicles;
}

export async function getVehicleQuota(userId: string): Promise<VehicleQuota> {
  const admin = createSupabaseAdmin();
  const qa = isQaUnlockEnabled();

  const [{ data: profile }, countRes] = await Promise.all([
    qa
      ? Promise.resolve({ data: null })
      : admin
          .from("profiles")
          .select("subscription_status, trial_ends_at, stripe_subscription_id")
          .eq("id", userId)
          .maybeSingle(),
    admin
      .from("user_vehicles")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("archived_at", null),
  ]);

  const resolvedTier: SubscriptionTier = qa
    ? "pro_heavy"
    : resolveSubscription(profile).tier;
  const maxVehicles = maxVehiclesForTier(resolvedTier);

  let currentCount = 0;
  if (countRes.error) {
    if (/archived_at/i.test(countRes.error.message)) {
      const fallback = await admin
        .from("user_vehicles")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);
      if (fallback.error) throw fallback.error;
      currentCount = fallback.count ?? 0;
    } else {
      throw countRes.error;
    }
  } else {
    currentCount = countRes.count ?? 0;
  }

  return {
    tier: resolvedTier,
    maxVehicles,
    currentCount,
    remaining: Math.max(0, maxVehicles - currentCount),
    canAdd: currentCount < maxVehicles,
  };
}

export async function assertCanAddVehicle(userId: string): Promise<VehicleQuota> {
  const quota = await getVehicleQuota(userId);
  if (!quota.canAdd) {
    throw new VehicleLimitError(quota.maxVehicles, quota.currentCount);
  }
  return quota;
}
