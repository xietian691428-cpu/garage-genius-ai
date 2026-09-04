import { cacheGet, cacheSet } from "@/lib/vehicle-data/cache";
import {
  RECALL_CACHE_MS,
  isNhtsaEnabled,
  recallHintLimit,
  vehicleDataTimeoutMs,
} from "@/lib/vehicle-data/config";
import { fetchJsonWithTimeout, vehicleDataLog } from "@/lib/vehicle-data/fetch";
import type {
  FetchLike,
  RecallHint,
  RecallQueryResult,
} from "@/lib/vehicle-data/types";
import { VehicleDataError } from "@/lib/vehicle-data/types";

const RECALLS_BY_VEHICLE = "https://api.nhtsa.gov/recalls/recallsByVehicle";

type NhtsaRecallRow = {
  NHTSACampaignNumber?: string;
  Component?: string;
  Summary?: string;
  Consequence?: string;
  Remedy?: string;
  ReportReceivedDate?: string;
  Make?: string;
  Model?: string;
  ModelYear?: string | number;
};

type NhtsaRecallResponse = {
  Count?: number;
  count?: number;
  Message?: string;
  results?: NhtsaRecallRow[];
  Results?: NhtsaRecallRow[];
};

function clip(text: string | undefined, max: number): string {
  const t = (text || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trim()}…`;
}

function ymmKey(year: number, make: string, model: string): string {
  return `recalls:${year}|${make.trim().toUpperCase()}|${model.trim().toUpperCase()}`;
}

function mapHint(row: NhtsaRecallRow): RecallHint | null {
  const campaignNumber = (row.NHTSACampaignNumber || "").trim();
  const component = clip(row.Component, 80);
  const summary = clip(row.Summary, 280);
  if (!campaignNumber && !summary && !component) return null;
  return {
    campaignNumber: campaignNumber || "unknown",
    component: component || "Unspecified component",
    summary,
    consequence: clip(row.Consequence, 180),
    remedy: clip(row.Remedy, 180),
    reportReceivedDate: row.ReportReceivedDate?.trim() || null,
  };
}

/**
 * NHTSA recalls by year/make/model (no public VIN-complete API for campaign status).
 * Education only — never treat results as "this VIN still needs repair".
 */
export async function fetchRecallsByYmm(
  year: number,
  make: string,
  model: string,
  options?: { fetchImpl?: FetchLike; timeoutMs?: number; limit?: number },
): Promise<RecallQueryResult | null> {
  if (!isNhtsaEnabled()) {
    vehicleDataLog("recalls.disabled");
    return null;
  }

  const y = Number(year);
  const mk = make?.trim();
  const md = model?.trim();
  if (!Number.isFinite(y) || y < 1966 || !mk || !md) return null;

  const limit = options?.limit ?? recallHintLimit();
  const cacheKey = ymmKey(y, mk, md);
  const cached = cacheGet<RecallQueryResult>(cacheKey);
  if (cached) {
    vehicleDataLog("recalls.cache_hit", {
      year: y,
      make: mk,
      model: md,
      total: cached.total,
    });
    return { ...cached, hints: cached.hints.slice(0, limit), cached: true };
  }

  const params = new URLSearchParams({
    make: mk,
    model: md,
    modelYear: String(y),
  });
  const url = `${RECALLS_BY_VEHICLE}?${params.toString()}`;

  try {
    const body = await fetchJsonWithTimeout<NhtsaRecallResponse>(url, {
      fetchImpl: options?.fetchImpl,
      timeoutMs: options?.timeoutMs ?? vehicleDataTimeoutMs(),
    });
    const rows = body.results ?? body.Results ?? [];
    const hints = rows
      .map(mapHint)
      .filter((h): h is RecallHint => Boolean(h));
    const total = Number(body.Count ?? body.count ?? hints.length) || hints.length;
    const result: RecallQueryResult = {
      source: "nhtsa-recalls",
      year: y,
      make: mk,
      model: md,
      total,
      hints: hints.slice(0, Math.max(limit, 8)),
      cached: false,
    };
    cacheSet(cacheKey, result, RECALL_CACHE_MS);
    vehicleDataLog("recalls.ok", {
      year: y,
      make: mk,
      model: md,
      total,
      shown: Math.min(limit, hints.length),
    });
    return { ...result, hints: result.hints.slice(0, limit) };
  } catch (err) {
    const code = err instanceof VehicleDataError ? err.code : "http";
    vehicleDataLog("recalls.fail", { year: y, make: mk, model: md, code });
    return null;
  }
}
