/**
 * Pack freshness — age + fluids fingerprint vs current garage vehicle.
 * Prompt Refresh when online; never invent newer specs offline.
 */

import type { VehicleInfo } from "@/lib/types/chat";
import { buildTripPackFluids, fluidsFingerprint } from "@/lib/offline-trip-pack/build-pack";
import type { TripPackManifest } from "@/lib/offline-trip-pack/types";

/** Default max age before suggesting a refresh (online). */
export const TRIP_PACK_MAX_AGE_DAYS = 30;

export type PackFreshnessStatus = "fresh" | "stale_age" | "stale_fluids";

export type PackFreshness = {
  status: PackFreshnessStatus;
  ageDays: number;
  /** True when the owner should refresh while online. */
  needsRefresh: boolean;
  fluidsChanged: boolean;
  ageExceeded: boolean;
};

export function packAgeDays(
  downloadedAt: string,
  now = Date.now(),
): number {
  const t = new Date(downloadedAt).getTime();
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;
  return Math.max(0, (now - t) / (24 * 60 * 60 * 1000));
}

export function evaluatePackFreshness(
  pack: TripPackManifest,
  vehicle: VehicleInfo | null | undefined,
  opts?: { now?: number; maxAgeDays?: number },
): PackFreshness {
  const now = opts?.now ?? Date.now();
  const maxAgeDays = opts?.maxAgeDays ?? TRIP_PACK_MAX_AGE_DAYS;
  const ageDays = packAgeDays(pack.downloadedAt, now);
  const ageExceeded = ageDays > maxAgeDays;

  let fluidsChanged = false;
  if (vehicle && vehicle.id === pack.vehicleId) {
    const currentFp = fluidsFingerprint(buildTripPackFluids(vehicle));
    fluidsChanged = currentFp !== pack.fluidsFingerprint;
  }

  let status: PackFreshnessStatus = "fresh";
  if (fluidsChanged) status = "stale_fluids";
  else if (ageExceeded) status = "stale_age";

  return {
    status,
    ageDays,
    needsRefresh: fluidsChanged || ageExceeded,
    fluidsChanged,
    ageExceeded,
  };
}
