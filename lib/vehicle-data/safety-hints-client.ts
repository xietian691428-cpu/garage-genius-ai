/**
 * Browser fetch for educational NHTSA safety hints.
 * Memory + session cache by YMM. Never stores a VIN.
 */

import { isNhtsaRecallMarket } from "@/lib/vehicle-data/recall-copy";
import type { RecallHint } from "@/lib/vehicle-data/types";

export type SafetyHintsPayload = {
  skipped?: boolean;
  unavailable?: boolean;
  total: number;
  hints: RecallHint[];
};

const memory = new Map<string, SafetyHintsPayload>();

export function ymmRecallCacheKey(
  year: number,
  make: string,
  model: string,
): string {
  return `${year}|${make.trim().toUpperCase()}|${model.trim().toUpperCase()}`;
}

function sessionGet(key: string): SafetyHintsPayload | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(`gg.nhtsaHints.${key}`);
    if (!raw) return null;
    return JSON.parse(raw) as SafetyHintsPayload;
  } catch {
    return null;
  }
}

function sessionSet(key: string, payload: SafetyHintsPayload): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(`gg.nhtsaHints.${key}`, JSON.stringify(payload));
  } catch {
    /* quota */
  }
}

export async function fetchSafetyHintsClient(input: {
  year?: number;
  make?: string;
  model?: string;
  market?: string | null;
  accessToken: string;
}): Promise<SafetyHintsPayload> {
  if (!isNhtsaRecallMarket(input.market)) {
    return { skipped: true, total: 0, hints: [] };
  }
  const year = Number(input.year);
  const make = (input.make || "").trim();
  const model = (input.model || "").trim();
  if (!year || !make || !model) {
    return { unavailable: true, total: 0, hints: [] };
  }

  const key = ymmRecallCacheKey(year, make, model);
  const cached = memory.get(key) || sessionGet(key);
  if (cached && !cached.unavailable) return cached;

  const params = new URLSearchParams({
    year: String(year),
    make,
    model,
    market: "US",
  });
  const res = await fetch(`/api/vehicles/safety-hints?${params}`, {
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });
  const json = (await res.json()) as SafetyHintsPayload;
  const payload: SafetyHintsPayload = {
    skipped: json.skipped,
    unavailable: Boolean(json.unavailable) || !res.ok,
    total: Number(json.total) || 0,
    hints: Array.isArray(json.hints) ? json.hints : [],
  };
  if (!payload.unavailable && !payload.skipped) {
    memory.set(key, payload);
    sessionSet(key, payload);
  }
  return payload;
}

export function recallBannerDismissKey(vehicleId: string): string {
  return `gg.recallBanner.dismissed.${vehicleId}`;
}

export function isRecallBannerDismissed(vehicleId: string): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(recallBannerDismissKey(vehicleId)) === "1";
  } catch {
    return false;
  }
}

export function dismissRecallBanner(vehicleId: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(recallBannerDismissKey(vehicleId), "1");
  } catch {
    /* ignore */
  }
}
