/**
 * Legacy helpers — prefer hooks/useVehicles + lib/user-vehicles for cloud garage.
 * Kept for offline-ish callers; mirrors localStorage cache written by userVehiclesService.
 */

import { DEFAULT_VEHICLE } from "@/lib/constants";
import { loadCurrentVehicleId } from "@/lib/chat-storage";
import type { VehicleInfo } from "@/lib/types/chat";

const LOCAL_VEHICLES_KEY = "garageGenius_vehicles";

export function loadStoredVehicles(): VehicleInfo[] {
  if (typeof window === "undefined") return [DEFAULT_VEHICLE];

  try {
    const raw = localStorage.getItem(LOCAL_VEHICLES_KEY);
    if (!raw) return [DEFAULT_VEHICLE];

    const parsed = JSON.parse(raw) as VehicleInfo[];
    return parsed.length > 0 ? parsed : [DEFAULT_VEHICLE];
  } catch {
    return [DEFAULT_VEHICLE];
  }
}

export function loadStoredVehicle(): VehicleInfo {
  const vehicles = loadStoredVehicles();
  const savedId = loadCurrentVehicleId();
  return vehicles.find((v) => v.id === savedId) ?? vehicles[0] ?? DEFAULT_VEHICLE;
}
