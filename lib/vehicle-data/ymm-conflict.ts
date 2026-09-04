/**
 * Garage YMM vs NHTSA vPIC snapshot, plus hand-fill unverified flag.
 * Used by Chat inject + vehicle UI. Full VIN is never included.
 */

import type { VehicleInfo } from "@/lib/types/chat";
import type { VpicSnapshot } from "@/lib/vehicle-data/types";

/** Stored on user_vehicles.tags when VIN decode failed and YMM was typed by hand. */
export const YMM_UNVERIFIED_TAG = "ymm_unverified";

export type VpicYmmConflict = {
  garageYmm: string;
  snapshotYmm: string;
  fields: Array<"year" | "make" | "model">;
};

function compactToken(value: string | number | null | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^a-z0-9]+/g, "");
}

export function formatYmmLine(
  year: number | null | undefined,
  make: string | null | undefined,
  model: string | null | undefined,
): string {
  return [year, make, model].filter((p) => p != null && String(p).trim()).join(" ");
}

export function hasYmmUnverifiedTag(tags?: string[] | null): boolean {
  return (tags ?? []).includes(YMM_UNVERIFIED_TAG);
}

export function tagsWithYmmUnverified(
  tags: string[] | undefined,
  unverified?: boolean,
): string[] {
  const rest = (tags ?? []).filter((t) => t !== YMM_UNVERIFIED_TAG);
  if (unverified === true) return [...rest, YMM_UNVERIFIED_TAG];
  if (unverified === false) return rest;
  if (hasYmmUnverifiedTag(tags)) return [...rest, YMM_UNVERIFIED_TAG];
  return rest;
}

/** Profile chips / prompt tags that owners should see — not internal flags. */
export function visibleGarageProfileTags(tags?: string[] | null): string[] {
  return (tags ?? []).filter((t) => t !== YMM_UNVERIFIED_TAG);
}

export function snapshotHasYmm(snapshot: VpicSnapshot | null | undefined): boolean {
  if (!snapshot) return false;
  return Boolean(
    snapshot.year ||
      (snapshot.make && snapshot.make.trim()) ||
      (snapshot.model && snapshot.model.trim()),
  );
}

export function detectVpicYmmConflict(input: {
  year?: number | null;
  make?: string | null;
  model?: string | null;
  vpicDecode?: VpicSnapshot | null;
}): VpicYmmConflict | null {
  const snap = input.vpicDecode;
  if (!snapshotHasYmm(snap) || !snap) return null;

  const fields: VpicYmmConflict["fields"] = [];
  if (snap.year != null && Number(input.year) && Number(input.year) !== Number(snap.year)) {
    fields.push("year");
  }
  if (snap.make && compactToken(input.make) && compactToken(input.make) !== compactToken(snap.make)) {
    fields.push("make");
  }
  if (
    snap.model &&
    compactToken(input.model) &&
    compactToken(input.model) !== compactToken(snap.model)
  ) {
    fields.push("model");
  }
  if (!fields.length) return null;

  return {
    garageYmm: formatYmmLine(input.year, input.make, input.model),
    snapshotYmm: formatYmmLine(snap.year, snap.make, snap.model),
    fields,
  };
}

export function detectVehicleVpicYmmConflict(
  vehicle: Pick<VehicleInfo, "year" | "make" | "model" | "vpicDecode">,
): VpicYmmConflict | null {
  return detectVpicYmmConflict(vehicle);
}

export function formatVehicleConflictPrompt(conflict: VpicYmmConflict): string {
  return `[VEHICLE_CONFLICT]
Garage year/make/model (${conflict.garageYmm}) does not match the saved NHTSA vPIC snapshot (${conflict.snapshotYmm}).
Before coaching, ask the owner to confirm which identity is correct. Do not mix specs from both. Do not assume the recall/spec set for the other identity.`;
}

export function formatYmmUnverifiedPrompt(): string {
  return `[YMM_UNVERIFIED]
Year/make/model were entered by hand because VIN decode was unavailable or failed. Treat identity as unverified; ask once to confirm before quoting model-specific capacity, torque, or campaign lists.`;
}

/** Chat system inject for identity gates. Empty string when nothing to warn. */
export function formatVehicleIdentityPrompt(vehicle: VehicleInfo): string {
  const parts: string[] = [];
  const conflict = detectVehicleVpicYmmConflict(vehicle);
  if (conflict) parts.push(formatVehicleConflictPrompt(conflict));
  if (vehicle.ymmUnverified || hasYmmUnverifiedTag(vehicle.tags)) {
    parts.push(formatYmmUnverifiedPrompt());
  }
  return parts.join("\n\n");
}
