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

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

export type SpokenVehicleConflict = {
  kind: "named_ymm" | "body_class";
  spoken: string;
  garageYmm: string;
};

const TRUCK_OR_SUV_SPOKEN =
  /\b(my|the|this)\s+(truck|pickup|suv|crossover|van|minivan|coupe|sedan|hatch(?:back)?)\b/i;

const TRUCKISH_MODELS =
  /\b(f-?150|f-?250|f-?350|silverado|sierra|ram\s*1500|tundra|tacoma|ranger|frontier|colorado|canyon|ridgeline|gladiator)\b/i;

const CARISH_MODELS =
  /\b(corolla|camry|civic|accord|altima|sentra|mazda3|jetta|golf|passat|prius|malibu|focus|fiesta|elantra|sonata)\b/i;

/**
 * Latest user text names a different YMM / body class than the garage archive.
 * Anchor stays garage; coach must confirm switch or rephrase — never fitment from spoken.
 */
export function detectSpokenVehicleConflict(
  vehicle: Pick<VehicleInfo, "year" | "make" | "model">,
  userText: string,
): SpokenVehicleConflict | null {
  const text = (userText || "").trim();
  if (!text || !vehicle.make?.trim() || !vehicle.model?.trim()) return null;
  const garageYmm = formatYmmLine(vehicle.year, vehicle.make, vehicle.model);
  const currentMake = compactToken(vehicle.make);
  const currentModel = compactToken(vehicle.model);

  const yearModel = text.match(
    /\b((?:19|20)\d{2})\s+([A-Za-z][A-Za-z0-9-]{1,24})\s+([A-Za-z][A-Za-z0-9-]{1,24})\b/,
  );
  if (yearModel) {
    const spokenMake = compactToken(yearModel[2]);
    const spokenModel = compactToken(yearModel[3]);
    if (
      spokenModel &&
      spokenModel !== currentModel &&
      (spokenMake !== currentMake || spokenModel !== currentModel)
    ) {
      return {
        kind: "named_ymm",
        spoken: yearModel[0],
        garageYmm,
      };
    }
  }

  const makeModel = text.match(
    new RegExp(
      `\\b${escapeRegExp(vehicle.make.trim())}\\s+([A-Za-z][A-Za-z0-9-]{1,24})\\b`,
      "i",
    ),
  );
  if (makeModel) {
    const spokenModel = compactToken(makeModel[1]);
    if (spokenModel && spokenModel !== currentModel) {
      return {
        kind: "named_ymm",
        spoken: makeModel[0],
        garageYmm,
      };
    }
  }

  // "my F-150" / "my Corolla" while garage is a different model
  const myModel = text.match(
    /\b(?:my|the|this)\s+([A-Za-z][A-Za-z0-9-]{1,24}(?:\s+[A-Za-z][A-Za-z0-9-]{1,24})?)\b/i,
  );
  if (myModel) {
    const spoken = compactToken(myModel[1]);
    if (
      spoken &&
      spoken !== currentModel &&
      spoken.length >= 3 &&
      /^(corolla|camry|civic|accord|f-?150|silverado|tundra|tacoma|rav4|mustang|outback|prius|highlander|pilot|wrangler)$/.test(
        spoken,
      )
    ) {
      return { kind: "named_ymm", spoken: myModel[0], garageYmm };
    }
  }

  const body = text.match(TRUCK_OR_SUV_SPOKEN);
  if (body) {
    const classWord = body[2].toLowerCase();
    const model = `${vehicle.model} ${vehicle.make}`;
    const isTruckish = TRUCKISH_MODELS.test(model);
    const isCarish = CARISH_MODELS.test(model);
    if (
      (classWord === "truck" || classWord === "pickup") &&
      isCarish &&
      !isTruckish
    ) {
      return { kind: "body_class", spoken: body[0], garageYmm };
    }
    if (
      (classWord === "sedan" ||
        classWord === "coupe" ||
        classWord === "hatch" ||
        classWord === "hatchback") &&
      isTruckish
    ) {
      return { kind: "body_class", spoken: body[0], garageYmm };
    }
  }

  return null;
}

export function formatSpokenVehicleConflictPrompt(
  conflict: SpokenVehicleConflict,
): string {
  return `[SPOKEN_VEHICLE_CONFLICT]
Owner wording ("${conflict.spoken}") does not match the garage archive vehicle (${conflict.garageYmm}).
[VEHICLE_ANCHOR] / fitment / Putco / oil specs MUST use the garage archive only — never the spoken name.
Ask the owner to confirm: switch the garage vehicle, or keep coaching the archived ${conflict.garageYmm} and rephrase.
Do not invent capacity, bulb size, or SKUs for the spoken vehicle.`;
}

/** Chat system inject for identity gates. Empty string when nothing to warn. */
export function formatVehicleIdentityPrompt(
  vehicle: VehicleInfo,
  latestUserText?: string | null,
): string {
  const parts: string[] = [];
  const conflict = detectVehicleVpicYmmConflict(vehicle);
  if (conflict) parts.push(formatVehicleConflictPrompt(conflict));
  if (vehicle.ymmUnverified || hasYmmUnverifiedTag(vehicle.tags)) {
    parts.push(formatYmmUnverifiedPrompt());
  }
  if (latestUserText?.trim()) {
    const spoken = detectSpokenVehicleConflict(vehicle, latestUserText);
    if (spoken) parts.push(formatSpokenVehicleConflictPrompt(spoken));
  }
  return parts.join("\n\n");
}
