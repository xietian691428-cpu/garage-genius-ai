/**
 * OBD odometer (Mode 01 PID 0xA6, km) → vehicle archive mileage write-back helpers.
 * Pure conversions — no I/O.
 */

import {
  normalizeVehicleMarket,
  type VehicleMarketCode,
} from "@/lib/types/vehicle-market";

export const KM_PER_MILE = 1.60934;

export type MileageUnit = "miles" | "km";

export type MileageSource = "manual" | "obd" | "import";

/** Markets that typically keep odometer in kilometers. */
const KM_MARKETS: VehicleMarketCode[] = ["EU", "AU", "MX"];

export function isMileageUnit(value: unknown): value is MileageUnit {
  return value === "miles" || value === "km";
}

export function normalizeMileageUnit(
  value: unknown,
  fallback: MileageUnit = "miles",
): MileageUnit {
  return isMileageUnit(value) ? value : fallback;
}

/** Infer archive unit from sales market when mileage_unit is unset. */
export function mileageUnitFromMarket(
  market?: VehicleMarketCode | string | null,
): MileageUnit {
  const code = normalizeVehicleMarket(market);
  return KM_MARKETS.includes(code) ? "km" : "miles";
}

export function kmToMiles(km: number): number {
  return km / KM_PER_MILE;
}

export function milesToKm(miles: number): number {
  return miles * KM_PER_MILE;
}

/** Convert OBD kilometers into the vehicle archive unit (rounded integer). */
export function convertOdometerKmToUnit(
  odometerKm: number,
  unit: MileageUnit,
): number {
  if (!Number.isFinite(odometerKm) || odometerKm <= 0) return 0;
  const raw = unit === "km" ? odometerKm : kmToMiles(odometerKm);
  return Math.max(0, Math.round(raw));
}

export function formatMileageWithUnit(
  mileage: number,
  unit: MileageUnit,
): string {
  const n = Math.max(0, Math.round(mileage)).toLocaleString();
  return unit === "km" ? `${n} km` : `${n} miles`;
}

/**
 * Decide whether to write OBD odometer into the archive.
 * - Only when new reading is strictly greater than stored mileage.
 * - Equal → optional timestamp-only refresh (caller decides).
 */
export function shouldWriteObdMileage(
  nextMileage: number,
  currentMileage: number,
): "write" | "touch" | "skip" {
  if (!Number.isFinite(nextMileage) || nextMileage <= 0) return "skip";
  const current = Math.max(0, Math.round(Number(currentMileage) || 0));
  const next = Math.round(nextMileage);
  if (next > current) return "write";
  if (next === current) return "touch";
  return "skip";
}
