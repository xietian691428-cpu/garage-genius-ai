/** AutoCare VCdb cascade + resolved vehicle config */

export type VcdbAction =
  | "status"
  | "years"
  | "makes"
  | "models"
  | "submodels"
  | "options"
  | "resolve";

export interface VcdbStatus {
  available: boolean;
  path?: string;
  vehicleCount?: number;
  message?: string;
}

export interface VcdbOptions {
  engines: string[];
  transmissions: string[];
  driveTypes: string[];
  brakes: string[];
  /** Distinct VCdb VehicleIDs matching year/make/model/submodel */
  vehicleIds: number[];
}

/** Resolved config stored on VehicleInfo + injected into chat */
export interface VcdbResolvedConfig {
  source: "vcdb";
  vehicleId: number | null;
  year: number;
  make: string;
  model: string;
  submodel: string | null;
  engine: string | null;
  transmission: string | null;
  driveType: string | null;
  brakes: string | null;
  /** Curated enrichment — not from VCdb raw tables */
  fuelGrade?: string | null;
  oilCapacity?: string | null;
  oilViscosity?: string | null;
  /** Human-readable one-liner for UI */
  summary: string;
  matchedAt: string;
}

export interface VcdbResolveInput {
  year: number;
  make: string;
  model: string;
  submodel?: string | null;
  engine?: string | null;
  transmission?: string | null;
  driveType?: string | null;
  brakes?: string | null;
}
