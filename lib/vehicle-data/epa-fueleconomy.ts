import { cacheGet, cacheSet } from "@/lib/vehicle-data/cache";
import {
  EPA_CACHE_MS,
  isEpaEnabled,
  vehicleDataTimeoutMs,
} from "@/lib/vehicle-data/config";
import { fetchJsonWithTimeout, vehicleDataLog } from "@/lib/vehicle-data/fetch";
import type { EpaMpgAnchor, FetchLike } from "@/lib/vehicle-data/types";
import { VehicleDataError } from "@/lib/vehicle-data/types";

const EPA_OPTIONS =
  "https://www.fueleconomy.gov/ws/rest/vehicle/menu/options";
const EPA_VEHICLE = "https://www.fueleconomy.gov/ws/rest/vehicle";

type MenuItem = { text?: string; value?: string };
type MenuResponse = { menuItem?: MenuItem | MenuItem[] };

type EpaVehicleJson = {
  city08?: number | string;
  highway08?: number | string;
  comb08?: number | string;
  fuelType1?: string;
  fuelType?: string;
};

function asItems(x: MenuItem | MenuItem[] | undefined): MenuItem[] {
  if (!x) return [];
  return Array.isArray(x) ? x : [x];
}

function num(v: number | string | undefined): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function isFuelEconomyQuestion(text: string): boolean {
  if (!text.trim()) return false;
  return /\b(mpg|fuel\s*econom|gas\s*mile|l\/100|liters?\s*per|km\/l|mileage\s*(rating|estimate)|how\s+(much|many).{0,24}(gas|fuel|petrol)|tank\s+range|official\s+mpg)\b/i.test(
    text,
  );
}

/**
 * Optional EPA FuelEconomy.gov MPG for year/make/model.
 * Uses the first menu option as a representative rating (trims vary). Fail-open.
 */
export async function fetchEpaMpg(
  year: number,
  make: string,
  model: string,
  options?: { fetchImpl?: FetchLike; timeoutMs?: number },
): Promise<EpaMpgAnchor | null> {
  if (!isEpaEnabled()) return null;
  const y = Number(year);
  const mk = make?.trim();
  const md = model?.trim();
  if (!Number.isFinite(y) || !mk || !md) return null;

  const cacheKey = `epa:${y}|${mk.toUpperCase()}|${md.toUpperCase()}`;
  const cached = cacheGet<EpaMpgAnchor>(cacheKey);
  if (cached) {
    vehicleDataLog("epa.cache_hit", { year: y, make: mk, model: md });
    return { ...cached, cached: true };
  }

  const timeoutMs = options?.timeoutMs ?? vehicleDataTimeoutMs();
  const fetchImpl = options?.fetchImpl;
  const params = new URLSearchParams({
    year: String(y),
    make: mk,
    model: md,
  });

  try {
    const menu = await fetchJsonWithTimeout<MenuResponse>(
      `${EPA_OPTIONS}?${params.toString()}`,
      { fetchImpl, timeoutMs, accept: "application/json" },
    );
    const first = asItems(menu.menuItem).find((item) => item.value);
    if (!first?.value) {
      vehicleDataLog("epa.empty_menu", { year: y, make: mk, model: md });
      return null;
    }

    const vehicle = await fetchJsonWithTimeout<EpaVehicleJson>(
      `${EPA_VEHICLE}/${encodeURIComponent(first.value)}`,
      { fetchImpl, timeoutMs, accept: "application/json" },
    );

    const anchor: EpaMpgAnchor = {
      source: "epa-fueleconomy",
      year: y,
      make: mk,
      model: md,
      optionLabel: (first.text || "").trim() || first.value,
      cityMpg: num(vehicle.city08),
      highwayMpg: num(vehicle.highway08),
      combinedMpg: num(vehicle.comb08),
      fuelType: vehicle.fuelType1 || vehicle.fuelType || null,
      cached: false,
    };
    if (!anchor.cityMpg && !anchor.highwayMpg && !anchor.combinedMpg) {
      return null;
    }
    cacheSet(cacheKey, anchor, EPA_CACHE_MS);
    vehicleDataLog("epa.ok", { year: y, make: mk, model: md });
    return anchor;
  } catch (err) {
    const code = err instanceof VehicleDataError ? err.code : "http";
    vehicleDataLog("epa.fail", { year: y, make: mk, model: md, code });
    return null;
  }
}
