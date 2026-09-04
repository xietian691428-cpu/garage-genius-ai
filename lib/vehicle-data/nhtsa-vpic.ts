import type { VehicleInfo } from "@/lib/types/chat";
import { cacheGet, cacheSet } from "@/lib/vehicle-data/cache";
import {
  VPIC_CACHE_MS,
  isNhtsaEnabled,
  vehicleDataTimeoutMs,
} from "@/lib/vehicle-data/config";
import { fetchJsonWithTimeout, vehicleDataLog } from "@/lib/vehicle-data/fetch";
import type {
  FetchLike,
  VpicDecodeResult,
  VpicSnapshot,
} from "@/lib/vehicle-data/types";
import { VehicleDataError } from "@/lib/vehicle-data/types";
import { maskVin, normalizeVin } from "@/lib/vehicle-data/vin";

const VPIC_DECODE_VALUES =
  "https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues";

const VIN_RAW_KEYS = new Set([
  "vin",
  "VIN",
  "VehicleDescriptor",
  "SuggestedVIN",
]);

type VpicValuesRow = Record<string, string | number | null | undefined>;

type VpicResponse = {
  Count?: number;
  Message?: string;
  Results?: VpicValuesRow[];
};

function str(row: VpicValuesRow, key: string): string | null {
  const v = row[key];
  if (v == null) return null;
  const s = String(v).trim();
  if (!s || /^not applicable$/i.test(s) || s === "0") return null;
  return s;
}

function compactRaw(row: VpicValuesRow): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(row)) {
    if (VIN_RAW_KEYS.has(key) || /vin/i.test(key)) continue;
    if (value == null) continue;
    const s = String(value).trim();
    if (!s || /^not applicable$/i.test(s)) continue;
    out[key] = s;
  }
  return out;
}

function formatEngine(row: VpicValuesRow): string | null {
  const disp = str(row, "DisplacementL");
  const cyl = str(row, "EngineCylinders");
  const fuel = str(row, "FuelTypePrimary");
  const model = str(row, "EngineModel");
  const bits = [
    disp ? `${disp}L` : null,
    cyl ? `${cyl}-cyl` : null,
    model,
    fuel,
  ].filter(Boolean);
  return bits.length ? bits.join(" ") : null;
}

function parseYear(row: VpicValuesRow): number | null {
  const y = Number(str(row, "ModelYear"));
  if (!Number.isFinite(y) || y < 1980 || y > 2100) return null;
  return y;
}

export function snapshotFromVpicRow(row: VpicValuesRow): VpicSnapshot | null {
  const year = parseYear(row);
  const make = str(row, "Make");
  const model = str(row, "Model");
  if (!year && !make && !model) return null;
  return {
    source: "nhtsa-vpic",
    decodedAt: new Date().toISOString(),
    year,
    make,
    model,
    trim: str(row, "Trim") || str(row, "Series"),
    engine: formatEngine(row),
    displacementL: str(row, "DisplacementL"),
    cylinders: str(row, "EngineCylinders"),
    fuelType: str(row, "FuelTypePrimary"),
    driveType: str(row, "DriveType"),
    transmission: str(row, "TransmissionStyle") || str(row, "TransmissionDescriptor"),
    errorText: str(row, "ErrorText"),
    raw: compactRaw(row),
  };
}

export function isFreshVpicSnapshot(
  snap: VpicSnapshot | null | undefined,
  maxAgeMs = VPIC_CACHE_MS,
): snap is VpicSnapshot {
  if (!snap || snap.source !== "nhtsa-vpic") return false;
  const t = Date.parse(snap.decodedAt);
  if (!Number.isFinite(t)) return false;
  return Date.now() - t < maxAgeMs;
}

/**
 * Decode a US-market VIN via NHTSA vPIC DecodeVinValues.
 * Fail-open: timeout / HTTP / parse → null (never throw to Chat).
 */
export async function decodeVinValues(
  vinRaw: string,
  options?: { fetchImpl?: FetchLike; timeoutMs?: number },
): Promise<VpicDecodeResult | null> {
  if (!isNhtsaEnabled()) {
    vehicleDataLog("vpic.disabled");
    return null;
  }

  const vin = normalizeVin(vinRaw);
  if (!vin) return null;

  const cacheKey = `vpic:${vin}`;
  const cached = cacheGet<VpicDecodeResult>(cacheKey);
  if (cached) {
    vehicleDataLog("vpic.cache_hit", { vin: maskVin(vin) });
    return { ...cached, cached: true };
  }

  const url = `${VPIC_DECODE_VALUES}/${encodeURIComponent(vin)}?format=json`;
  try {
    const body = await fetchJsonWithTimeout<VpicResponse>(url, {
      fetchImpl: options?.fetchImpl,
      timeoutMs: options?.timeoutMs ?? vehicleDataTimeoutMs(),
    });
    const row = body.Results?.[0];
    if (!row) {
      vehicleDataLog("vpic.empty", { vin: maskVin(vin) });
      return null;
    }
    const snapshot = snapshotFromVpicRow(row);
    if (!snapshot?.make && !snapshot?.model) {
      vehicleDataLog("vpic.no_ymm", { vin: maskVin(vin) });
      return null;
    }
    const result: VpicDecodeResult = { ...snapshot, cached: false };
    cacheSet(cacheKey, result, VPIC_CACHE_MS);
    vehicleDataLog("vpic.ok", {
      vin: maskVin(vin),
      year: snapshot.year,
      make: snapshot.make,
      model: snapshot.model,
    });
    return result;
  } catch (err) {
    const code = err instanceof VehicleDataError ? err.code : "http";
    vehicleDataLog("vpic.fail", { vin: maskVin(vin), code });
    return null;
  }
}

/** Fill blank garage fields from vPIC; never overwrite a user-entered YMM. */
export function mergeVpicIntoVehicle(
  vehicle: VehicleInfo,
  decode: VpicSnapshot,
): VehicleInfo {
  const engineUnknown = !vehicle.engine || /^unknown$/i.test(vehicle.engine);
  const { cached: _cached, ...snapshot } = decode as VpicSnapshot & {
    cached?: boolean;
  };
  return {
    ...vehicle,
    year: vehicle.year || snapshot.year || vehicle.year,
    make: vehicle.make?.trim() || snapshot.make || vehicle.make,
    model: vehicle.model?.trim() || snapshot.model || vehicle.model,
    engine:
      engineUnknown && snapshot.engine ? snapshot.engine : vehicle.engine,
    submodel: vehicle.submodel || snapshot.trim || undefined,
    transmission: vehicle.transmission || snapshot.transmission || undefined,
    driveType: vehicle.driveType || snapshot.driveType || undefined,
    vpicDecode: snapshot,
    vpicDecodedAt: snapshot.decodedAt,
  };
}
