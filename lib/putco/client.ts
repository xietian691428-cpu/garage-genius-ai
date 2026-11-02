/**
 * Read-only Putco YMM fitment client.
 * Official: GET https://www.putco.com/ai/fitment (OpenAPI 1.0.x, no auth).
 * Do not send VIN. Do not mirror the full catalog into RAG.
 */

import { cacheGet, cacheSet } from "@/lib/vehicle-data/cache";
import type {
  FetchPutcoFitmentInput,
  PutcoCountry,
  PutcoFitmentOk,
  PutcoFitmentResult,
  PutcoProductBrief,
} from "@/lib/putco/types";

export const PUTCO_FITMENT_URL = "https://www.putco.com/ai/fitment";
export const PUTCO_TIMEOUT_MS = 6_000;
export const PUTCO_CACHE_MS = 24 * 60 * 60 * 1000;
export const PUTCO_USER_AGENT =
  "GarageGeniusAI/1.0 (+https://garagegenius.cloud; putco-fitment-readonly)";

function cacheKey(
  year: number,
  make: string,
  model: string,
  country: PutcoCountry,
): string {
  return `putco:fitment:${year}|${make.trim().toUpperCase()}|${model.trim().toUpperCase()}|${country}`;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

/** Normalize one product row from brief or catalog schema. */
export function normalizePutcoProduct(raw: unknown): PutcoProductBrief | null {
  const o = asRecord(raw);
  if (!o) return null;
  const sku = str(o.sku) || str(o.item_id) || str(o.SKU);
  const title =
    str(o.title) ||
    str(o.name) ||
    str(o.item_title) ||
    str(o.product_title);
  if (!sku && !title) return null;
  return {
    sku: sku || "unknown",
    title: title || sku,
    price: str(o.price) || str(o.sale_price) || null,
    url: str(o.url) || str(o.link) || str(o.product_url) || null,
    category: str(o.category) || str(o.product_type) || null,
    shortDescription:
      str(o.short_description) || str(o.description)?.slice(0, 160) || null,
  };
}

/**
 * Parse Putco /ai/fitment JSON. Shape can be { products: [] }, { results: [] },
 * or a bare array (OpenAPI describes matching YMM application rows).
 */
export function parsePutcoFitmentPayload(data: unknown): PutcoProductBrief[] {
  if (Array.isArray(data)) {
    return data
      .map(normalizePutcoProduct)
      .filter((p): p is PutcoProductBrief => Boolean(p));
  }
  const o = asRecord(data);
  if (!o) return [];
  const list =
    (Array.isArray(o.products) && o.products) ||
    (Array.isArray(o.results) && o.results) ||
    (Array.isArray(o.items) && o.items) ||
    (Array.isArray(o.data) && o.data) ||
    [];
  return list
    .map(normalizePutcoProduct)
    .filter((p): p is PutcoProductBrief => Boolean(p));
}

export async function fetchPutcoFitment(
  input: FetchPutcoFitmentInput,
): Promise<PutcoFitmentResult> {
  const year = Number(input.year);
  const make = (input.make || "").trim();
  const model = (input.model || "").trim();
  const country: PutcoCountry = input.country === "ca" ? "ca" : "us";

  if (!Number.isFinite(year) || year < 1980 || year > 2100 || !make || !model) {
    return { ok: false, reason: "missing_ymm" };
  }

  const key = cacheKey(year, make, model, country);
  if (!input.bypassCache) {
    const cached = cacheGet<PutcoFitmentOk>(key);
    if (cached?.ok) {
      return { ...cached, fromCache: true };
    }
  }

  const timeoutMs = input.timeoutMs ?? PUTCO_TIMEOUT_MS;
  const fetchImpl = input.fetchImpl ?? fetch;
  const url = new URL(PUTCO_FITMENT_URL);
  url.searchParams.set("year", String(year));
  url.searchParams.set("make", make);
  url.searchParams.set("model", model);
  url.searchParams.set("country", country);
  url.searchParams.set("schema", "brief");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchImpl(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": PUTCO_USER_AGENT,
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      return {
        ok: false,
        reason: "http",
        detail: `HTTP ${res.status}`,
      };
    }

    let json: unknown;
    try {
      json = await res.json();
    } catch {
      return { ok: false, reason: "parse", detail: "invalid JSON" };
    }

    const products = parsePutcoFitmentPayload(json);
    if (!products.length) {
      return { ok: false, reason: "empty", detail: "no matching SKUs" };
    }

    const ok: PutcoFitmentOk = {
      ok: true,
      year,
      make,
      model,
      country,
      products,
      fromCache: false,
      fetchedAt: new Date().toISOString(),
    };
    if (!input.bypassCache) {
      cacheSet(key, ok, PUTCO_CACHE_MS);
    }
    return ok;
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    const message = err instanceof Error ? err.message : String(err);
    if (name === "AbortError" || /aborted|timeout/i.test(message)) {
      return {
        ok: false,
        reason: "timeout",
        detail: `timed out after ${timeoutMs}ms`,
      };
    }
    return { ok: false, reason: "http", detail: message.slice(0, 160) };
  } finally {
    clearTimeout(timer);
  }
}
