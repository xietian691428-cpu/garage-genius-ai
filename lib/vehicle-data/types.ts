/**
 * Official vehicle-fact layer (NHTSA / EPA / local DTC).
 * Facts stay structured; the coach model must quote, not rewrite, official numbers.
 */

export type VehicleDataErrorCode =
  | "timeout"
  | "http"
  | "parse"
  | "disabled"
  | "invalid"
  | "empty";

export class VehicleDataError extends Error {
  code: VehicleDataErrorCode;
  status?: number;

  constructor(
    message: string,
    code: VehicleDataErrorCode,
    status?: number,
  ) {
    super(message);
    this.name = "VehicleDataError";
    this.code = code;
    this.status = status;
  }
}

/** Compact NHTSA vPIC snapshot stored on the vehicle row (no full VIN). */
export type VpicSnapshot = {
  source: "nhtsa-vpic";
  decodedAt: string;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  engine: string | null;
  displacementL: string | null;
  cylinders: string | null;
  fuelType: string | null;
  driveType: string | null;
  transmission: string | null;
  errorText: string | null;
  /** Non-empty DecodeVinValues fields only; VIN keys stripped. */
  raw: Record<string, string>;
};

export type VpicDecodeResult = VpicSnapshot & {
  cached: boolean;
};

export type RecallHint = {
  campaignNumber: string;
  component: string;
  summary: string;
  consequence: string;
  remedy: string;
  reportReceivedDate: string | null;
};

export type RecallQueryResult = {
  source: "nhtsa-recalls";
  year: number;
  make: string;
  model: string;
  total: number;
  hints: RecallHint[];
  cached: boolean;
};

export type EpaMpgAnchor = {
  source: "epa-fueleconomy";
  year: number;
  make: string;
  model: string;
  optionLabel: string;
  cityMpg: number | null;
  highwayMpg: number | null;
  combinedMpg: number | null;
  fuelType: string | null;
  cached: boolean;
};

export type DtcSystem = "powertrain" | "body" | "chassis" | "network";

export type DtcSeverityHint = "low" | "medium" | "high" | "info";

export type DtcDiyLevel = "observe" | "basic" | "advanced" | "shop";

export type LocalDtcCatalogEntry = {
  code: string;
  title_en: string;
  summary_en: string;
  system: DtcSystem;
  severity_hint: DtcSeverityHint;
  common_causes: string[];
  diy_level: DtcDiyLevel;
  safety_notes?: string;
};

export type LocalDtcRef = {
  code: string;
  title: string;
  summary: string;
  system: DtcSystem;
  severityHint: DtcSeverityHint;
  /** Mapped SAE-style label for existing Chat/OBD UI. */
  severity: "Info" | "Low" | "Moderate" | "High";
  commonCauses: string[];
  diyLevel: DtcDiyLevel;
  safetyNotes: string | null;
  /** Alias of summary for older call sites. */
  edu: string;
  catalogHit: boolean;
};

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;
