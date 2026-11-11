import type { VehicleInfo } from "@/lib/types/chat";
import { DRIVE_SAFETY_COPY } from "@/lib/drive-safety";
import { listStopRules } from "@/lib/safety/stop-rules";
import { localDtcCatalogSize } from "@/lib/vehicle-data/dtc-local";
import { TRIP_PACK_EDU_CARDS } from "@/lib/offline-trip-pack/edu-cards";
import type {
  TripPackEmergencyContacts,
  TripPackFluidField,
  TripPackFluids,
  TripPackManifest,
  TripPackSavedPlace,
  TripPackFluidSource,
} from "@/lib/offline-trip-pack/types";
import { TRIP_PACK_VERSION } from "@/lib/offline-trip-pack/types";

const PACKABLE_SOURCES = new Set<string>([
  "user_manual_confirmed",
  "user_entered",
]);

function packField(
  value: string | null | undefined,
  source: string | null | undefined,
): TripPackFluidField | undefined {
  const v = value?.trim();
  if (!v) return undefined;
  if (!source || !PACKABLE_SOURCES.has(source)) return undefined;
  return { value: v, source: source as TripPackFluidSource };
}

/** Edge + browser safe non-crypto fingerprint for pack content. */
export function contentHashHex(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Last 8 characters of VIN only. */
export function vinTailForPack(vin?: string | null): string | undefined {
  const t = vin?.trim().toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, "");
  if (!t) return undefined;
  if (t.length <= 8) return t;
  return t.slice(-8);
}

export function fluidsFingerprint(fluids: TripPackFluids): string {
  const parts = [
    fluids.oilCapacity?.value,
    fluids.oilViscosity?.value,
    fluids.coolantSpecText?.value,
    fluids.coolantCapacityText?.value,
    fluids.coolantMixText?.value,
    fluids.brakeFluidSpecText?.value,
    fluids.transmissionKind,
    fluids.atfSpecText?.value,
    fluids.atfCapacityText?.value,
  ];
  return parts.map((p) => p ?? "").join("|");
}

export function buildTripPackFluids(vehicle: VehicleInfo): TripPackFluids {
  const fluids: TripPackFluids = {
    oilCapacity: packField(vehicle.oilCapacity, vehicle.oilCapacitySource),
    oilViscosity: packField(vehicle.oilViscosity, vehicle.oilViscositySource),
    coolantSpecText: packField(
      vehicle.coolantSpecText,
      vehicle.coolantSpecSource,
    ),
    coolantCapacityText: packField(
      vehicle.coolantCapacityText,
      vehicle.coolantCapacitySource,
    ),
    coolantMixText: packField(vehicle.coolantMixText, vehicle.coolantMixSource),
    brakeFluidSpecText: packField(
      vehicle.brakeFluidSpecText,
      vehicle.brakeFluidSpecSource,
    ),
    brakeFluidNotesText: packField(
      vehicle.brakeFluidNotesText,
      vehicle.brakeFluidNotesSource,
    ),
    atfSpecText: packField(vehicle.atfSpecText, vehicle.atfSpecSource),
    atfCapacityText: packField(
      vehicle.atfCapacityText,
      vehicle.atfCapacitySource,
    ),
    atfNotesText: packField(vehicle.atfNotesText, vehicle.atfNotesSource),
  };
  if (
    vehicle.transmissionKind === "atf" ||
    vehicle.transmissionKind === "cvt" ||
    vehicle.transmissionKind === "unknown"
  ) {
    fluids.transmissionKind = vehicle.transmissionKind;
  }
  return fluids;
}

export type BuildTripPackInput = {
  userId: string;
  vehicle: VehicleInfo;
  contacts?: TripPackEmergencyContacts;
  places?: TripPackSavedPlace[];
  manualReadyHint?: boolean;
  now?: Date;
};

/**
 * Pure client-side pack assembly from garage VehicleInfo + safety snapshots.
 * Does not call AI or fetch manuals.
 */
export function buildTripPack(input: BuildTripPackInput): TripPackManifest {
  const { userId, vehicle } = input;
  if (!userId.trim()) throw new Error("userId required");
  if (!vehicle.id?.trim()) throw new Error("vehicle.id required");

  const fluids = buildTripPackFluids(vehicle);
  const stopRules = listStopRules();
  const downloadedAt = (input.now ?? new Date()).toISOString();

  const draft: Omit<TripPackManifest, "contentHash" | "approxBytes"> = {
    packVersion: TRIP_PACK_VERSION,
    userId: userId.trim(),
    vehicleId: vehicle.id,
    downloadedAt,
    fluidsFingerprint: fluidsFingerprint(fluids),
    identity: {
      name: vehicle.name,
      year: vehicle.year,
      make: vehicle.make,
      model: vehicle.model,
      submodel: vehicle.submodel,
      market: vehicle.market,
      engine: vehicle.engine,
      transmission: vehicle.transmission,
      vinTail: vinTailForPack(vehicle.vin),
    },
    fluids,
    stopRules,
    driveSafety: {
      doNotDrive: DRIVE_SAFETY_COPY.doNotDrive,
      noLimp: DRIVE_SAFETY_COPY.noLimp,
    },
    dtcCatalogSize: localDtcCatalogSize(),
    eduCards: TRIP_PACK_EDU_CARDS,
    contacts: input.contacts ?? {},
    places: input.places ?? [],
    manualReadyHint: input.manualReadyHint,
  };

  const json = JSON.stringify(draft);
  const contentHash = contentHashHex(json);
  const approxBytes = new TextEncoder().encode(
    JSON.stringify({ ...draft, contentHash }),
  ).length;

  return {
    ...draft,
    contentHash,
    approxBytes,
  };
}
