/**
 * Vehicle market / country version — owner manuals, emissions, lighting,
 * and some powertrains differ by sales region (US vs EU vs UK, etc.).
 */

export type VehicleMarketCode =
  | "US"
  | "CA"
  | "MX"
  | "GB"
  | "EU"
  | "AU"
  | "OTHER";

export type VehicleMarketOption = {
  code: VehicleMarketCode;
  label: string;
  /** Short hint for DIY owners */
  hint: string;
  /** ISO-ish region tag used in knowledge metadata */
  knowledgeRegion: string;
};

/** Curated markets for Garage Genius Launch (US/EU DIY focus). */
export const VEHICLE_MARKETS: VehicleMarketOption[] = [
  {
    code: "US",
    label: "United States",
    hint: "USDM · AKI fuel · mph · SAE/US manuals",
    knowledgeRegion: "US",
  },
  {
    code: "CA",
    label: "Canada",
    hint: "Often close to USDM; bilingual manuals common",
    knowledgeRegion: "CA",
  },
  {
    code: "MX",
    label: "Mexico",
    hint: "LATAM / MX-spec equipment may differ from US",
    knowledgeRegion: "MX",
  },
  {
    code: "GB",
    label: "United Kingdom",
    hint: "UKDM · RHD · mph · UK/EU manuals",
    knowledgeRegion: "GB",
  },
  {
    code: "EU",
    label: "European Union / EEA",
    hint: "EUDM · km/h · RON fuel · ECE lighting",
    knowledgeRegion: "EU",
  },
  {
    code: "AU",
    label: "Australia / NZ",
    hint: "AUDM · often RHD · local ADR rules",
    knowledgeRegion: "AU",
  },
  {
    code: "OTHER",
    label: "Other / not sure",
    hint: "We'll still coach DIY — confirm specs in your local manual",
    knowledgeRegion: "OTHER",
  },
];

export const DEFAULT_VEHICLE_MARKET: VehicleMarketCode = "US";

export function isVehicleMarketCode(value: unknown): value is VehicleMarketCode {
  return (
    typeof value === "string" &&
    VEHICLE_MARKETS.some((m) => m.code === value)
  );
}

export function normalizeVehicleMarket(
  value: unknown,
  fallback: VehicleMarketCode = DEFAULT_VEHICLE_MARKET,
): VehicleMarketCode {
  return isVehicleMarketCode(value) ? value : fallback;
}

export function vehicleMarketLabel(code: VehicleMarketCode | string | undefined): string {
  const normalized = normalizeVehicleMarket(code);
  return VEHICLE_MARKETS.find((m) => m.code === normalized)?.label ?? normalized;
}

export function vehicleMarketHint(code: VehicleMarketCode | string | undefined): string {
  const normalized = normalizeVehicleMarket(code);
  return VEHICLE_MARKETS.find((m) => m.code === normalized)?.hint ?? "";
}

/** Knowledge / RAG region tag for a market (e.g. US → US, EU → EU). */
export function getRegion(
  code: VehicleMarketCode | string | undefined,
): string {
  const normalized = normalizeVehicleMarket(code);
  return (
    VEHICLE_MARKETS.find((m) => m.code === normalized)?.knowledgeRegion ??
    normalized
  );
}

/**
 * Compact market block for Chat / Dashboard diagnosis prompts.
 * Specs and manuals must follow this sales region.
 */
export function formatMarketContextBlock(vehicle: {
  year: number;
  make: string;
  model: string;
  submodel?: string | null;
  market?: VehicleMarketCode | string | null;
}): string {
  const market = normalizeVehicleMarket(vehicle.market);
  const region = getRegion(market);
  const label = vehicleMarketLabel(market);
  const hint = vehicleMarketHint(market);
  const ymm = [vehicle.year, vehicle.make, vehicle.model, vehicle.submodel]
    .filter(Boolean)
    .join(" ");

  return [
    "## Market / Region Context",
    `Vehicle: ${ymm}`,
    `Market: ${market} (${label} · region ${region})`,
    `Notes: ${hint}`,
    `Specifications, fluids labeling, lighting, emissions, and DIY steps must follow ${market} region manuals and regulations.`,
    `Prefer ${market}-spec OEM / aftermarket guidance; if unsure, tell the user to confirm in the local owner's manual.`,
  ].join("\n");
}

function vehicleYmmLine(vehicle: {
  year: number;
  make: string;
  model: string;
  submodel?: string | null;
}): string {
  return [vehicle.year, vehicle.make, vehicle.model, vehicle.submodel || null]
    .filter(Boolean)
    .join(" ");
}

/** Machine/prompt form, e.g. "2023 Toyota Camry SE - US". */
export function formatVehicleYmmMarket(vehicle: {
  year: number;
  make: string;
  model: string;
  submodel?: string | null;
  market?: VehicleMarketCode | string | null;
}): string {
  const market = normalizeVehicleMarket(vehicle.market);
  return `${vehicleYmmLine(vehicle)} - ${market}`;
}

/**
 * Owner-facing YMM. US-first app: don't stamp "US" on every line,
 * and never show the catch-all OTHER code.
 */
export function formatVehicleYmmDisplay(vehicle: {
  year: number;
  make: string;
  model: string;
  submodel?: string | null;
  market?: VehicleMarketCode | string | null;
}): string {
  const ymm = vehicleYmmLine(vehicle);
  const raw = vehicle.market;
  if (!isVehicleMarketCode(raw) || raw === "US" || raw === "OTHER") return ymm;
  return `${ymm} · ${raw}`;
}

/** Picker / list row: nickname only when it isn't just another YMM string. */
export function formatVehiclePickerLabel(vehicle: {
  name?: string | null;
  year: number;
  make: string;
  model: string;
  submodel?: string | null;
  market?: VehicleMarketCode | string | null;
}): string {
  const ymm = formatVehicleYmmDisplay(vehicle);
  const name = vehicle.name?.trim();
  if (!name) return ymm;
  const lower = name.toLowerCase();
  if (lower === ymm.toLowerCase()) return ymm;
  const model = vehicle.model.toLowerCase();
  const make = vehicle.make.toLowerCase();
  if (
    (model && lower.includes(model)) ||
    (make && lower.includes(make) && name.includes(String(vehicle.year)))
  ) {
    return ymm;
  }
  return `${name} · ${ymm}`;
}

const MARKET_PREF_KEY = "garageGenius_preferredMarket";

export function loadPreferredMarket(): VehicleMarketCode {
  if (typeof window === "undefined") return DEFAULT_VEHICLE_MARKET;
  try {
    return normalizeVehicleMarket(localStorage.getItem(MARKET_PREF_KEY));
  } catch {
    return DEFAULT_VEHICLE_MARKET;
  }
}

export function savePreferredMarket(code: VehicleMarketCode): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(MARKET_PREF_KEY, code);
  } catch {
    /* ignore */
  }
}
