import type { RegionInspection } from "@/lib/types/dashboard";

const CACHE_PREFIX = "garageGenius_inspect_";
/** 缓存 14 天，过期后需重新调 AI */
const CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export interface CachedInspection {
  inspection: RegionInspection;
  symptoms: string;
  cachedAt: number;
}

function cacheKey(
  vehicleId: string,
  regionId: string,
  symptoms: string,
): string {
  const symptomKey = symptoms.trim().toLowerCase() || "_general_";
  return `${CACHE_PREFIX}${vehicleId}_${regionId}_${symptomKey}`;
}

function isExpired(cachedAt: number): boolean {
  return Date.now() - cachedAt > CACHE_TTL_MS;
}

export function loadInspectionCache(
  vehicleId: string,
  regionId: string,
  symptoms: string,
): CachedInspection | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem(cacheKey(vehicleId, regionId, symptoms));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as CachedInspection;
    if (!parsed.inspection || isExpired(parsed.cachedAt)) {
      localStorage.removeItem(cacheKey(vehicleId, regionId, symptoms));
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

/** 打开区域时加载最近一次有效缓存，避免重复调 API */
export function loadLatestRegionCache(
  vehicleId: string,
  regionId: string,
): CachedInspection | null {
  if (typeof window === "undefined") return null;

  let latest: CachedInspection | null = null;

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(`${CACHE_PREFIX}${vehicleId}_${regionId}_`)) {
        continue;
      }

      const raw = localStorage.getItem(key);
      if (!raw) continue;

      const parsed = JSON.parse(raw) as CachedInspection;
      if (!parsed.inspection || isExpired(parsed.cachedAt)) {
        localStorage.removeItem(key);
        continue;
      }

      if (!latest || parsed.cachedAt > latest.cachedAt) {
        latest = parsed;
      }
    }
  } catch {
    return null;
  }

  return latest;
}

export function saveInspectionCache(
  vehicleId: string,
  regionId: string,
  symptoms: string,
  inspection: RegionInspection,
): void {
  if (typeof window === "undefined") return;

  const entry: CachedInspection = {
    inspection,
    symptoms: symptoms.trim(),
    cachedAt: Date.now(),
  };

  try {
    localStorage.setItem(
      cacheKey(vehicleId, regionId, symptoms),
      JSON.stringify(entry),
    );
  } catch {
    // quota exceeded — skip cache
  }
}
