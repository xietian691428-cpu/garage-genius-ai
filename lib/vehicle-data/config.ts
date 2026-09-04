function envFlag(name: string, defaultOn: boolean): boolean {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") return defaultOn;
  return !["0", "false", "off", "no"].includes(raw.trim().toLowerCase());
}

/**
 * Default on; set NHTSA_ENABLED=0 to disable vPIC + recalls.
 * Recalls are also skipped unless vehicle market is US (see isNhtsaRecallMarket).
 */
export function isNhtsaEnabled(): boolean {
  return envFlag("NHTSA_ENABLED", true);
}

/** Optional EPA FuelEconomy.gov anchors (fail-open). Default on. */
export function isEpaEnabled(): boolean {
  return envFlag("EPA_FUELECONOMY_ENABLED", true);
}

export function vehicleDataTimeoutMs(): number {
  const n = Number(process.env.VEHICLE_DATA_TIMEOUT_MS);
  if (Number.isFinite(n) && n >= 1_000 && n <= 20_000) return Math.floor(n);
  return 6_000;
}

export function recallHintLimit(): number {
  const n = Number(process.env.VEHICLE_DATA_RECALL_LIMIT);
  if (Number.isFinite(n) && n >= 1 && n <= 10) return Math.floor(n);
  return 3;
}

export function isVehicleDataDebug(): boolean {
  return process.env.VEHICLE_DATA_DEBUG === "1";
}

export const VPIC_CACHE_MS = 24 * 60 * 60 * 1000;
export const RECALL_CACHE_MS = 12 * 60 * 60 * 1000;
export const EPA_CACHE_MS = 24 * 60 * 60 * 1000;

export const NHTSA_USER_AGENT =
  "GarageGeniusAI/1.0 (educational DIY coach; +https://garagegenius.cloud)";
