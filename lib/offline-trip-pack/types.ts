/**
 * Offline Trip Pack — local-only emergency read model (no offline AI).
 */

import type { VehicleMarketCode } from "@/lib/types/vehicle-market";
import type { StopRule } from "@/lib/safety/stop-rules";

export const TRIP_PACK_VERSION = 1;

/** Pack-stored fluid row — only confirmed / user_entered (never vcdb-as-required). */
export type TripPackFluidSource =
  | "user_manual_confirmed"
  | "user_entered";

export type TripPackFluidField = {
  value: string;
  source: TripPackFluidSource;
};

export type TripPackIdentity = {
  name: string;
  year: number;
  make: string;
  model: string;
  submodel?: string;
  market?: VehicleMarketCode;
  engine?: string;
  transmission?: string;
  /** Last 8 of VIN only — never full VIN. */
  vinTail?: string;
};

export type TripPackFluids = {
  oilCapacity?: TripPackFluidField;
  oilViscosity?: TripPackFluidField;
  coolantSpecText?: TripPackFluidField;
  coolantCapacityText?: TripPackFluidField;
  coolantMixText?: TripPackFluidField;
  brakeFluidSpecText?: TripPackFluidField;
  brakeFluidNotesText?: TripPackFluidField;
  transmissionKind?: "atf" | "cvt" | "unknown";
  atfSpecText?: TripPackFluidField;
  atfCapacityText?: TripPackFluidField;
  atfNotesText?: TripPackFluidField;
};

export type TripPackEmergencyContacts = {
  roadsidePhone?: string;
  insurancePhone?: string;
  emergencyNote?: string;
};

export type TripPackSavedPlace = {
  id: string;
  label: string;
  lat?: number;
  lng?: number;
};

export type TripPackEduCard = {
  id: string;
  title: string;
  /** Observation-only steps — never DIY teardown. */
  steps: string[];
  stopIf: string;
};

export type TripPackManifest = {
  packVersion: number;
  userId: string;
  vehicleId: string;
  downloadedAt: string;
  contentHash: string;
  approxBytes: number;
  fluidsFingerprint: string;
  identity: TripPackIdentity;
  fluids: TripPackFluids;
  /** Snapshot of stop-rules at download time (same content as live module). */
  stopRules: StopRule[];
  driveSafety: {
    doNotDrive: string;
    noLimp: string;
  };
  /** Catalog size / version marker — lookup still uses live dtc-local in app. */
  dtcCatalogSize: number;
  eduCards: TripPackEduCard[];
  contacts: TripPackEmergencyContacts;
  places: TripPackSavedPlace[];
  /** Optional: owner said a manual PDF exists for this car (no chunks in P0). */
  manualReadyHint?: boolean;
};

export type OfflineObdSessionCache = {
  vehicleId: string;
  codes: string[];
  /** Always offline_session — never "live". */
  source: "offline_session";
  capturedAt: string;
};

export type OfflineAssistMatch = {
  query: string;
  stopRuleHits: StopRule[];
  driveSafetyHit: boolean;
  doNotDrive: boolean;
  dtcRefs: Array<{
    code: string;
    title: string;
    summary: string;
    catalogHit: boolean;
    checkOrder: string[];
    safetyNotes: string | null;
    commonCauses: string[];
  }>;
  /** Static observation card ids from the trip pack (educational only). */
  eduCardIds: string[];
};
