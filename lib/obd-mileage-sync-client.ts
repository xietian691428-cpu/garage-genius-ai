/**
 * Client helper: after a successful BLE OBD read, sync odometer → vehicle archive.
 * Failures are silent (log only) so diagnosis UX is never blocked.
 */

import { supabase } from "@/lib/supabase";
import type { MileageUnit } from "@/lib/obd-mileage";

export type ObdMileageSyncResult = {
  updated: boolean;
  touched?: boolean;
  skipped?: string;
  mileage?: number;
  unit?: MileageUnit;
  previousMileage?: number;
  message?: string;
};

export async function syncObdMileageToVehicle(input: {
  vehicleId?: string | null;
  odometerKm?: number | null;
}): Promise<ObdMileageSyncResult | null> {
  const vehicleId = input.vehicleId?.trim();
  const odometerKm = input.odometerKm;

  if (!vehicleId) return null;
  if (odometerKm == null || !Number.isFinite(odometerKm) || odometerKm <= 0) {
    return null;
  }

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      console.warn("[obd-mileage-sync] no session — skip write-back");
      return null;
    }

    const res = await fetch("/api/obd/mileage-sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ vehicleId, odometerKm }),
    });

    if (!res.ok) {
      console.warn(
        "[obd-mileage-sync] HTTP",
        res.status,
        await res.text().catch(() => ""),
      );
      return null;
    }

    return (await res.json()) as ObdMileageSyncResult;
  } catch (err) {
    console.warn(
      "[obd-mileage-sync]",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
