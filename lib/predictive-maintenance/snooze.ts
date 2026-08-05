/**
 * Client-side snooze for predictive maintenance cards.
 * Avoids a DB migration for v1 — 30 days or +1,000 mi, whichever applies first
 * when evaluating (stored as both until ISO and untilMileage).
 */

import type { PredictiveItemKey } from "@/lib/predictive-maintenance/catalog";

const STORAGE_KEY = "garageGenius_predictive_snooze_v1";

export type PredictiveSnoozeEntry = {
  until: string; // ISO
  untilMileage: number;
};

type SnoozeMap = Record<string, PredictiveSnoozeEntry>;

function vehicleBucket(vehicleId: string, map: SnoozeMap): SnoozeMap {
  const out: SnoozeMap = {};
  const prefix = `${vehicleId}::`;
  for (const [k, v] of Object.entries(map)) {
    if (k.startsWith(prefix)) out[k] = v;
  }
  return out;
}

function readAll(): SnoozeMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SnoozeMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(map: SnoozeMap) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* quota */
  }
}

function entryKey(vehicleId: string, itemKey: PredictiveItemKey) {
  return `${vehicleId}::${itemKey}`;
}

export function snoozePredictiveItem(
  vehicleId: string,
  itemKey: PredictiveItemKey,
  currentMileage: number,
  opts?: { days?: number; miles?: number },
): PredictiveSnoozeEntry {
  const days = opts?.days ?? 30;
  const miles = opts?.miles ?? 1000;
  const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  const untilMileage = Math.max(0, Math.floor(currentMileage) + miles);
  const entry: PredictiveSnoozeEntry = { until, untilMileage };
  const all = readAll();
  all[entryKey(vehicleId, itemKey)] = entry;
  writeAll(all);
  return entry;
}

export function isPredictiveItemSnoozed(
  vehicleId: string,
  itemKey: PredictiveItemKey,
  currentMileage: number,
  now = Date.now(),
): boolean {
  const all = readAll();
  const entry = all[entryKey(vehicleId, itemKey)];
  if (!entry) return false;
  const untilMs = Date.parse(entry.until);
  const timeActive = Number.isFinite(untilMs) && untilMs > now;
  const milesActive =
    typeof entry.untilMileage === "number" &&
    currentMileage < entry.untilMileage;
  // Snooze holds while EITHER clock OR mileage threshold has not yet passed
  // (user asked to defer ~30d OR ~1k mi — treat as OR hold).
  return timeActive || milesActive;
}

export function clearPredictiveSnooze(
  vehicleId: string,
  itemKey: PredictiveItemKey,
) {
  const all = readAll();
  delete all[entryKey(vehicleId, itemKey)];
  writeAll(all);
}

export function listSnoozesForVehicle(vehicleId: string): SnoozeMap {
  return vehicleBucket(vehicleId, readAll());
}
