/**
 * Server Chat vehicle identity: ownership, header/request match, focus bind.
 * Does not change CoachScenarioPlayer.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { VehicleInfo } from "@/lib/types/chat";
import type { TurnFocus } from "@/lib/chat-intent-drift";
import {
  rowToVehicleInfo,
  type UserVehicleRow,
} from "@/lib/user-vehicles";

export const VEHICLE_NOT_OWNED_CODE = "VEHICLE_NOT_OWNED";
export const VEHICLE_SELECTION_MISMATCH_CODE = "VEHICLE_SELECTION_MISMATCH";

export type ConversationFocusPayload = {
  previous?: TurnFocus | null;
  abandoned?: TurnFocus | null;
  vehicleId?: string;
  apiHistoryFromId?: string | null;
};

export function vehicleSelectionMismatch(
  selectedVehicleId: string | undefined | null,
  requestVehicleId: string | undefined | null,
): boolean {
  if (!selectedVehicleId?.trim() || !requestVehicleId?.trim()) return false;
  return selectedVehicleId.trim() !== requestVehicleId.trim();
}

/**
 * Drop previous/abandoned focus when the payload was saved for another vehicle
 * or when vehicleId is missing (untrusted / legacy). Prevents old-car raised /
 * parkingBrake / apiHistoryFromId from entering a new-car request.
 */
export function bindConversationFocusToVehicle(
  focus: ConversationFocusPayload | null | undefined,
  vehicleId: string | undefined,
): ConversationFocusPayload | null {
  if (!vehicleId) return null;
  if (!focus) {
    return {
      vehicleId,
      previous: null,
      abandoned: null,
      apiHistoryFromId: null,
    };
  }
  // Missing vehicleId on the payload is treated as a mismatch — never inherit
  // raised / PB / history cursor from an unlabeled blob.
  if (!focus.vehicleId?.trim() || focus.vehicleId !== vehicleId) {
    return {
      vehicleId,
      previous: null,
      abandoned: null,
      apiHistoryFromId: null,
    };
  }
  return { ...focus, vehicleId };
}

/** Garage row wins for identity (YMM, mileage, VIN, vPIC). Client may carry unsaved notes. */
export function bindChatVehicleIdentity(
  client: VehicleInfo,
  owned: VehicleInfo,
): VehicleInfo {
  return {
    ...client,
    id: owned.id,
    name: owned.name,
    year: owned.year,
    make: owned.make,
    model: owned.model,
    submodel: owned.submodel,
    market: owned.market,
    mileage: owned.mileage,
    mileageUnit: owned.mileageUnit,
    engine: owned.engine,
    transmission: owned.transmission,
    driveType: owned.driveType,
    brakes: owned.brakes,
    fuelGrade: owned.fuelGrade,
    oilCapacity: owned.oilCapacity,
    oilViscosity: owned.oilViscosity,
    vin: owned.vin,
    licensePlate: owned.licensePlate,
    lastMaintenance: owned.lastMaintenance,
    notes: owned.notes ?? client.notes,
    tags: owned.tags,
    ymmUnverified: owned.ymmUnverified,
    vcdb: owned.vcdb ?? client.vcdb,
    vpicDecode: owned.vpicDecode ?? client.vpicDecode,
    vpicDecodedAt: owned.vpicDecodedAt ?? client.vpicDecodedAt,
    countryRegion: owned.countryRegion ?? client.countryRegion,
    countryState: owned.countryState ?? client.countryState,
    insuranceProvider: owned.insuranceProvider ?? client.insuranceProvider,
  };
}

export async function loadOwnedGarageVehicle(
  userClient: SupabaseClient,
  userId: string,
  vehicleId: string | undefined,
): Promise<VehicleInfo | null> {
  const id = vehicleId?.trim();
  if (!id) return null;

  let { data, error } = await userClient
    .from("user_vehicles")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (error && /archived_at/i.test(error.message)) {
    const retry = await userClient
      .from("user_vehicles")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    data = retry.data;
    error = retry.error;
  }

  if (error) throw error;
  if (!data) return null;
  return rowToVehicleInfo(data as UserVehicleRow);
}
