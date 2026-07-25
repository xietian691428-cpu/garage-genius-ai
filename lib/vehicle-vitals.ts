/**
 * Per-vehicle dashboard vitals — fluids, DTCs, health history.
 * Persisted in localStorage (per vehicle). Ready to sync to cloud later.
 */

import type { VehicleInfo } from "@/lib/types/chat";
import { normalizeVehicleMarket } from "@/lib/types/vehicle-market";

export type FluidKey =
  | "engineOil"
  | "coolant"
  | "brakeFluid"
  | "tirePressure";

export type FluidStatus = {
  key: FluidKey;
  label: string;
  value: string;
  level: "good" | "normal" | "low" | "critical" | "unknown";
};

export type DiagnosticCode = {
  code: string;
  desc: string;
  severity: "Info" | "Low" | "Moderate" | "High";
  source: "obd" | "photo" | "manual" | "demo";
  recordedAt: string;
};

export type HealthSnapshot = {
  at: string;
  score: number;
};

export type VehicleVitals = {
  vehicleId: string;
  fluids: FluidStatus[];
  codes: DiagnosticCode[];
  healthHistory: HealthSnapshot[];
  lastObdAt?: string;
  lastPhotoAt?: string;
  updatedAt: string;
};

const STORAGE_PREFIX = "garageGenius_vitals_";

export const DEFAULT_FLUIDS: FluidStatus[] = [
  { key: "engineOil", label: "Engine Oil", value: "Not checked", level: "unknown" },
  { key: "coolant", label: "Coolant", value: "Not checked", level: "unknown" },
  { key: "brakeFluid", label: "Brake Fluid", value: "Not checked", level: "unknown" },
  {
    key: "tirePressure",
    label: "Tire Pressure",
    value: "Not checked",
    level: "unknown",
  },
];

function storageKey(vehicleId: string) {
  return `${STORAGE_PREFIX}${vehicleId}`;
}

export function createEmptyVitals(vehicleId: string): VehicleVitals {
  return {
    vehicleId,
    fluids: DEFAULT_FLUIDS.map((f) => ({ ...f })),
    codes: [],
    healthHistory: [],
    updatedAt: new Date().toISOString(),
  };
}

export function loadVehicleVitals(vehicleId: string): VehicleVitals {
  if (typeof window === "undefined") return createEmptyVitals(vehicleId);
  try {
    const raw = localStorage.getItem(storageKey(vehicleId));
    if (!raw) return createEmptyVitals(vehicleId);
    const parsed = JSON.parse(raw) as VehicleVitals;
    if (!parsed || parsed.vehicleId !== vehicleId) {
      return createEmptyVitals(vehicleId);
    }
    return {
      ...createEmptyVitals(vehicleId),
      ...parsed,
      fluids:
        parsed.fluids?.length === 4
          ? parsed.fluids
          : createEmptyVitals(vehicleId).fluids,
      codes: Array.isArray(parsed.codes) ? parsed.codes : [],
      healthHistory: Array.isArray(parsed.healthHistory)
        ? parsed.healthHistory.slice(-30)
        : [],
    };
  } catch {
    return createEmptyVitals(vehicleId);
  }
}

export function saveVehicleVitals(vitals: VehicleVitals): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      storageKey(vitals.vehicleId),
      JSON.stringify({ ...vitals, updatedAt: new Date().toISOString() }),
    );
  } catch {
    /* ignore quota */
  }
}

function daysSince(iso: string | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / (24 * 60 * 60 * 1000));
}

/** Dynamic health 0–100 from fluids, codes, and service freshness. */
export function computeHealthScore(
  vehicle: VehicleInfo,
  vitals: VehicleVitals,
): number {
  let score = 96;

  for (const fluid of vitals.fluids) {
    if (fluid.level === "low") score -= 6;
    if (fluid.level === "critical") score -= 12;
    if (fluid.level === "unknown") score -= 1;
  }

  for (const code of vitals.codes) {
    if (code.severity === "High") score -= 10;
    else if (code.severity === "Moderate") score -= 6;
    else if (code.severity === "Low") score -= 3;
    else score -= 1;
  }

  const sinceService = daysSince(vehicle.lastMaintenance);
  if (sinceService == null) score -= 2;
  else if (sinceService > 365) score -= 10;
  else if (sinceService > 180) score -= 5;

  if (vehicle.mileage > 150_000) score -= 4;
  else if (vehicle.mileage > 100_000) score -= 2;

  return Math.max(35, Math.min(99, Math.round(score)));
}

/** Miles until a rough next-service reminder (oil ~5k / 6mo heuristic). */
export function estimateMilesToService(vehicle: VehicleInfo): {
  miles: number | null;
  label: string;
} {
  const interval = 5000;
  if (!vehicle.mileage || vehicle.mileage <= 0) {
    return { miles: null, label: "Set mileage" };
  }
  // Without last oil mileage, use 5k cadence from current as reminder window
  const sinceService = daysSince(vehicle.lastMaintenance);
  if (sinceService != null && sinceService > 180) {
    return { miles: 0, label: "Due now" };
  }
  const miles = Math.max(200, interval - (vehicle.mileage % interval));
  return { miles, label: `${miles.toLocaleString()} mi` };
}

/** Rough DIY market-band estimate — not a valuation API. */
export function estimateMarketBand(vehicle: VehicleInfo): string {
  const age = Math.max(0, new Date().getFullYear() - vehicle.year);
  const base =
    /toyota|honda|lexus/i.test(vehicle.make) ? 22000 :
    /ford|chevy|chevrolet|gmc|ram/i.test(vehicle.make) ? 20000 :
    /bmw|mercedes|audi/i.test(vehicle.make) ? 28000 :
    18000;

  let value = base - age * 1400 - (vehicle.mileage / 1000) * 45;
  value = Math.max(2500, value);

  const market = normalizeVehicleMarket(vehicle.market);
  if (market === "EU" || market === "GB") value *= 0.92;
  if (market === "AU") value *= 0.95;

  if (value >= 10000) return `$${(value / 1000).toFixed(1)}k`;
  return `$${Math.round(value / 100) * 100}`;
}

export function levelFromValue(value: string): FluidStatus["level"] {
  const v = value.toLowerCase();
  if (/critical|empty|fail/.test(v)) return "critical";
  if (/low|leak|warn/.test(v)) return "low";
  if (/good|ok|full|normal|34|35|36|psi/.test(v)) {
    return /normal/.test(v) ? "normal" : "good";
  }
  if (/not checked|unknown|—|-/.test(v)) return "unknown";
  return "normal";
}

export function fluidTone(level: FluidStatus["level"]): string {
  switch (level) {
    case "good":
      return "text-emerald-400";
    case "normal":
      return "text-cyan-300";
    case "low":
      return "text-amber-400";
    case "critical":
      return "text-rose-400";
    default:
      return "text-slate-500";
  }
}

export function severityTone(severity: DiagnosticCode["severity"]): string {
  switch (severity) {
    case "High":
      return "text-rose-400";
    case "Moderate":
      return "text-amber-400";
    case "Low":
      return "text-yellow-300";
    default:
      return "text-slate-400";
  }
}

/** Demo / fallback OBD snapshot when Web Bluetooth is unavailable. */
export function demoObdSnapshot(): {
  fluids: FluidStatus[];
  codes: DiagnosticCode[];
} {
  const now = new Date().toISOString();
  return {
    fluids: [
      { key: "engineOil", label: "Engine Oil", value: "Good", level: "good" },
      { key: "coolant", label: "Coolant", value: "Normal", level: "normal" },
      { key: "brakeFluid", label: "Brake Fluid", value: "Good", level: "good" },
      {
        key: "tirePressure",
        label: "Tire Pressure",
        value: "34 PSI (All)",
        level: "good",
      },
    ],
    codes: [
      {
        code: "P0171",
        desc: "System Too Lean (Bank 1)",
        severity: "Moderate",
        source: "demo",
        recordedAt: now,
      },
    ],
  };
}

export function buildCodesAskPrompt(
  vehicle: VehicleInfo,
  codes: DiagnosticCode[],
): string {
  const market = normalizeVehicleMarket(vehicle.market);
  const list = codes
    .map((c) => `${c.code} (${c.severity}): ${c.desc}`)
    .join("; ");
  return (
    `My ${vehicle.year} ${vehicle.make} ${vehicle.model} (${market} market) has these diagnostic codes: ${list}. ` +
    `Explain likely DIY causes for this market/spec, safe checks, and parts to verify — use my vehicle config and RAG manuals.`
  );
}

export function buildPhotoScanPrompt(vehicle: VehicleInfo): string {
  const market = normalizeVehicleMarket(vehicle.market);
  return (
    `Photo diagnosis for my ${vehicle.year} ${vehicle.make} ${vehicle.model} (${market} market). ` +
    `I photographed the dash / fluid levels / warning lights. Describe what you see, estimate fluid/tire status if visible, ` +
    `list any codes or warnings, and give DIY next steps for this market. Emit a Focus marker for the primary area.`
  );
}

export function healthTrendLabel(history: HealthSnapshot[]): string {
  if (history.length < 2) return "No trend yet";
  const prev = history[history.length - 2]?.score ?? 0;
  const last = history[history.length - 1]?.score ?? 0;
  const delta = last - prev;
  if (delta >= 2) return `↑ ${delta} vs last check`;
  if (delta <= -2) return `↓ ${Math.abs(delta)} vs last check`;
  return "Stable";
}

export function buildReminders(
  vehicle: VehicleInfo,
  vitals: VehicleVitals,
  health: number,
): string[] {
  const notes: string[] = [];
  const service = estimateMilesToService(vehicle);
  if (service.miles === 0) {
    notes.push("Service interval looks due — schedule oil / inspection.");
  } else if (service.miles != null && service.miles < 800) {
    notes.push(`Next service in ~${service.miles} miles.`);
  }
  if (vitals.codes.some((c) => c.severity === "High" || c.severity === "Moderate")) {
    notes.push("Active DTCs need DIY triage — Ask AI or scan with OBD.");
  }
  if (vitals.fluids.some((f) => f.level === "low" || f.level === "critical")) {
    notes.push("Fluid level warning — confirm on dipstick / reservoir.");
  }
  if (health < 75) {
    notes.push("Health score is soft — prioritize brakes, leaks, and CEL.");
  }
  if (!notes.length) {
    notes.push(
      `${normalizeVehicleMarket(vehicle.market)}-spec manuals preferred in AI tips.`,
    );
  }
  return notes.slice(0, 3);
}
