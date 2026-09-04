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

/** Single-session jump cap — garbage BLE frames, not a road trip. */
export const IMPLAUSIBLE_MILEAGE_JUMP_MILES = 50_000;
export const IMPLAUSIBLE_MILEAGE_JUMP_KM = 80_000;

export type ObdMileageSkipReason = "invalid" | "decreased" | "implausible_jump";

export type ObdMileageWriteDecision =
  | { action: "write" }
  | { action: "touch" }
  | { action: "skip"; reason: ObdMileageSkipReason };

/**
 * Decide whether to write OBD odometer into the archive.
 * - Only increase (equal → timestamp touch).
 * - Decline a decrease or an implausible one-shot jump.
 */
export function evaluateObdMileageWrite(
  nextMileage: number,
  currentMileage: number,
  unit: MileageUnit = "miles",
): ObdMileageWriteDecision {
  if (!Number.isFinite(nextMileage) || nextMileage <= 0) {
    return { action: "skip", reason: "invalid" };
  }
  const current = Math.max(0, Math.round(Number(currentMileage) || 0));
  const next = Math.round(nextMileage);
  if (next < current) return { action: "skip", reason: "decreased" };
  if (next === current) return { action: "touch" };
  const jump = next - current;
  const cap =
    unit === "km" ? IMPLAUSIBLE_MILEAGE_JUMP_KM : IMPLAUSIBLE_MILEAGE_JUMP_MILES;
  if (current > 0 && jump > cap) {
    return { action: "skip", reason: "implausible_jump" };
  }
  return { action: "write" };
}

export function obdMileageSkipUserMessage(
  reason: Exclude<ObdMileageSkipReason, "invalid"> | "not_newer",
  previousMileage: number,
  unit: MileageUnit,
): string {
  const shown = formatMileageWithUnit(previousMileage, unit);
  if (reason === "implausible_jump") {
    return `OBD odometer jumped too far from the archived ${shown}. Mileage was not overwritten — check the reading or update it manually.`;
  }
  return `OBD odometer is not higher than the archived ${shown}. Mileage was not reduced.`;
}

/**
 * Decide whether to write OBD odometer into the archive.
 * - Only when new reading is strictly greater than stored mileage.
 * - Equal → optional timestamp-only refresh (caller decides).
 */
export function shouldWriteObdMileage(
  nextMileage: number,
  currentMileage: number,
  unit: MileageUnit = "miles",
): "write" | "touch" | "skip" {
  return evaluateObdMileageWrite(nextMileage, currentMileage, unit).action;
}

/** Gate before calling mileage-sync API / DB write. */
export function canAttemptObdMileageWriteback(
  hasObdAdapter: boolean,
  odometerKm: number | null | undefined,
): boolean {
  return (
    hasObdAdapter === true &&
    odometerKm != null &&
    Number.isFinite(odometerKm) &&
    odometerKm > 0
  );
}
