/**
 * Cloud vehicle_vitals CRUD (Vision / OBD snapshots) + merge into local vitals.
 */

import { supabase } from "@/lib/supabase";
import {
  DEFAULT_FLUIDS,
  createEmptyVitals,
  levelFromValue,
  loadVehicleVitals,
  saveVehicleVitals,
  shouldKeepLocalVitals,
  type DiagnosticCode,
  type FluidKey,
  type FluidStatus,
  type VehicleVitals,
} from "@/lib/vehicle-vitals";
import { normalizeVehicleMarket } from "@/lib/types/vehicle-market";
import type { VehicleInfo } from "@/lib/types/chat";

export type VisionVehicleAnalysis = {
  fluids?: Record<string, string>;
  tire_pressure?: string | null;
  codes?: Array<{
    code?: string;
    desc?: string;
    severity?: string;
  }>;
  health_score?: number | null;
  notes?: string | null;
  warning_lights?: string[];
};

export type VehicleVitalsRow = {
  id: string;
  vehicle_id: string;
  user_id: string;
  snapshot_at: string;
  fluids: Record<string, string> | null;
  tire_pressure: string | null;
  dtc_codes: unknown;
  health_score: number | null;
  notes: string | null;
  market: string | null;
  source: string;
};

const FLUID_KEYS: FluidKey[] = [
  "engineOil",
  "coolant",
  "brakeFluid",
  "tirePressure",
];

function normalizeSeverity(
  raw: string | undefined,
): DiagnosticCode["severity"] {
  const s = (raw || "").toLowerCase();
  if (s.includes("high") || s.includes("critical")) return "High";
  if (s.includes("mod")) return "Moderate";
  if (s.includes("low")) return "Low";
  return "Info";
}

/** Map Vision / cloud fluids object → FluidStatus[] */
export function fluidsFromRecord(
  record: Record<string, string> | null | undefined,
  tirePressure?: string | null,
): FluidStatus[] {
  const base = DEFAULT_FLUIDS.map((f) => ({ ...f }));
  if (!record && !tirePressure) return base;

  const aliases: Record<string, FluidKey> = {
    engineoil: "engineOil",
    oil: "engineOil",
    engine_oil: "engineOil",
    coolant: "coolant",
    brakefluid: "brakeFluid",
    brake_fluid: "brakeFluid",
    brake: "brakeFluid",
    tirepressure: "tirePressure",
    tire_pressure: "tirePressure",
    tires: "tirePressure",
  };

  for (const [rawKey, rawVal] of Object.entries(record || {})) {
    const key =
      aliases[rawKey.replace(/\s+/g, "").toLowerCase()] ||
      (FLUID_KEYS.includes(rawKey as FluidKey) ? (rawKey as FluidKey) : null);
    if (!key || typeof rawVal !== "string") continue;
    const idx = base.findIndex((f) => f.key === key);
    if (idx < 0) continue;
    base[idx] = {
      ...base[idx],
      value: rawVal,
      level: levelFromValue(rawVal),
    };
  }

  if (tirePressure?.trim()) {
    const idx = base.findIndex((f) => f.key === "tirePressure");
    if (idx >= 0) {
      base[idx] = {
        ...base[idx],
        value: tirePressure.trim(),
        level: levelFromValue(tirePressure),
      };
    }
  }

  return base;
}

export function codesFromVision(
  codes: VisionVehicleAnalysis["codes"],
  source: DiagnosticCode["source"] = "photo",
): DiagnosticCode[] {
  if (!Array.isArray(codes)) return [];
  const now = new Date().toISOString();
  return codes
    .map((c) => {
      const code = String(c?.code || "")
        .trim()
        .toUpperCase();
      if (!code) return null;
      return {
        code,
        desc: String(c?.desc || "Detected from photo").trim(),
        severity: normalizeSeverity(c?.severity),
        source,
        recordedAt: now,
      } satisfies DiagnosticCode;
    })
    .filter((c): c is DiagnosticCode => Boolean(c))
    .slice(0, 8);
}

export function fluidsToRecord(fluids: FluidStatus[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fluids) out[f.key] = f.value;
  return out;
}

/** Apply Vision JSON onto local VehicleVitals (UI state). */
export function applyVisionToVitals(
  current: VehicleVitals,
  analysis: VisionVehicleAnalysis,
  vehicle: VehicleInfo,
): VehicleVitals {
  const fluids = fluidsFromRecord(analysis.fluids, analysis.tire_pressure);
  // Keep unchecked fields from previous if vision left them empty/unknown
  const mergedFluids = fluids.map((f) => {
    if (f.level !== "unknown") return f;
    const prev = current.fluids.find((p) => p.key === f.key);
    return prev && prev.level !== "unknown" ? prev : f;
  });

  const photoCodes = codesFromVision(analysis.codes, "photo");
  const codes = [...photoCodes, ...current.codes]
    .filter(
      (c, i, arr) => arr.findIndex((x) => x.code === c.code) === i,
    )
    .slice(0, 8);

  const score =
    typeof analysis.health_score === "number" &&
    analysis.health_score >= 0 &&
    analysis.health_score <= 100
      ? Math.round(analysis.health_score)
      : undefined;

  return {
    ...current,
    vehicleId: vehicle.id,
    fluids: mergedFluids,
    codes,
    lastPhotoAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    healthHistory: score
      ? [
          ...current.healthHistory.slice(-29),
          { at: new Date().toISOString(), score },
        ]
      : current.healthHistory,
  };
}

export const vehicleVitalsCloud = {
  async insertSnapshot(input: {
    vehicle: VehicleInfo;
    fluids: FluidStatus[];
    codes: DiagnosticCode[];
    healthScore: number;
    notes?: string | null;
    source?: "photo" | "obd" | "manual" | "demo" | "system";
  }): Promise<VehicleVitalsRow | null> {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const tire = input.fluids.find((f) => f.key === "tirePressure")?.value;

    const row = {
      vehicle_id: input.vehicle.id,
      user_id: user.id,
      fluids: fluidsToRecord(input.fluids),
      tire_pressure: tire && tire !== "Not checked" ? tire : null,
      dtc_codes: input.codes.map((c) => ({
        code: c.code,
        desc: c.desc,
        severity: c.severity,
        source: c.source,
      })),
      health_score: input.healthScore,
      notes: input.notes ?? null,
      market: normalizeVehicleMarket(input.vehicle.market),
      source: input.source ?? "photo",
    };

    const { data, error } = await supabase
      .from("vehicle_vitals")
      .insert(row)
      .select("*")
      .single();

    if (error) {
      console.warn("[vehicle_vitals] insert:", error.message);
      return null;
    }
    return data as VehicleVitalsRow;
  },

  async listRecent(
    vehicleId: string,
    limit = 20,
  ): Promise<VehicleVitalsRow[]> {
    const { data, error } = await supabase
      .from("vehicle_vitals")
      .select("*")
      .eq("vehicle_id", vehicleId)
      .order("snapshot_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.warn("[vehicle_vitals] list:", error.message);
      return [];
    }
    return (data as VehicleVitalsRow[]) || [];
  },

  /** Convert a cloud snapshot row into local UI vitals (for restore). */
  snapshotToLocal(
    vehicleId: string,
    row: VehicleVitalsRow,
    historyScores?: { at: string; score: number }[],
  ): VehicleVitals {
    const fluids = fluidsFromRecord(
      row.fluids as Record<string, string>,
      row.tire_pressure,
    );
    const codes = codesFromVision(
      Array.isArray(row.dtc_codes)
        ? (row.dtc_codes as VisionVehicleAnalysis["codes"])
        : [],
      (row.source as DiagnosticCode["source"]) || "photo",
    );
    const score =
      typeof row.health_score === "number" ? row.health_score : undefined;

    return {
      ...createEmptyVitals(vehicleId),
      fluids,
      codes,
      healthHistory: historyScores?.length
        ? historyScores
        : score != null
          ? [{ at: row.snapshot_at, score }]
          : [],
      lastPhotoAt: row.source === "photo" ? row.snapshot_at : undefined,
      lastObdAt: row.source === "obd" ? row.snapshot_at : undefined,
      updatedAt: row.snapshot_at,
    };
  },

  /** Hydrate local vitals from latest cloud snapshot + score history. */
  async hydrateLocal(vehicleId: string): Promise<VehicleVitals> {
    const localFallback = loadVehicleVitals(vehicleId);
    const rows = await this.listRecent(vehicleId, 30);
    if (!rows.length) return localFallback;

    const healthHistory = rows
      .filter((r) => typeof r.health_score === "number")
      .map((r) => ({
        at: r.snapshot_at,
        score: r.health_score as number,
      }))
      .reverse()
      .slice(-30);

    if (shouldKeepLocalVitals(localFallback, rows[0].snapshot_at)) {
      const merged: VehicleVitals = {
        ...localFallback,
        healthHistory:
          localFallback.healthHistory.length >= healthHistory.length
            ? localFallback.healthHistory
            : healthHistory,
      };
      saveVehicleVitals(merged);
      return merged;
    }

    const next = this.snapshotToLocal(vehicleId, rows[0], healthHistory);
    saveVehicleVitals(next);
    return next;
  },
};
