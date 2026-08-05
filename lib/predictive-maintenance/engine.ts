/**
 * Rule-engine predictive maintenance — no ML.
 * Uses catalog intervals + optional maintenance_records + local snooze.
 */

import type { VehicleInfo } from "@/lib/types/chat";
import type { MaintenanceRecord } from "@/lib/types/maintenance";
import {
  PREDICTIVE_MAINTENANCE_CATALOG,
  type DiyDifficulty,
  type PredictiveCatalogItem,
  type PredictiveItemKey,
} from "@/lib/predictive-maintenance/catalog";
import { isPredictiveItemSnoozed } from "@/lib/predictive-maintenance/snooze";

export type PredictiveUrgency = "overdue" | "due_soon" | "upcoming";

export type PredictiveMaintenanceCard = {
  key: PredictiveItemKey;
  title: string;
  urgency: PredictiveUrgency;
  nextDueMileage: number;
  milesRemaining: number;
  monthsRemaining: number | null;
  difficulty: DiyDifficulty;
  estCostUsd?: { min: number; max: number };
  coachSlug?: string;
  howToPrompt: string;
  basedOnTypicalIntervals: boolean;
  lastServiceMileage: number | null;
  lastServiceDate: string | null;
};

const DUE_SOON_MILES = 1500;
const DUE_SOON_MONTHS = 2;
const UPCOMING_MILES = 5000;

const URGENCY_RANK: Record<PredictiveUrgency, number> = {
  overdue: 0,
  due_soon: 1,
  upcoming: 2,
};

function monthsBetween(fromIso: string, toMs: number): number | null {
  const from = Date.parse(fromIso);
  if (Number.isNaN(from)) return null;
  return (toMs - from) / (1000 * 60 * 60 * 24 * 30.4375);
}

function findLastService(
  item: PredictiveCatalogItem,
  records: MaintenanceRecord[],
): { mileage: number | null; date: string | null } {
  const sorted = [...records].sort((a, b) => {
    const da = Date.parse(a.performedAt) || 0;
    const db = Date.parse(b.performedAt) || 0;
    return db - da;
  });

  for (const r of sorted) {
    const hay = `${r.title} ${r.category} ${r.description || ""} ${r.notes || ""}`.toLowerCase();
    const hit = item.matchKeywords.some((kw) => hay.includes(kw.toLowerCase()));
    if (!hit) continue;
    return {
      mileage:
        typeof r.mileage === "number" && Number.isFinite(r.mileage)
          ? r.mileage
          : null,
      date: r.performedAt || null,
    };
  }
  return { mileage: null, date: null };
}

function vehicleAgeYears(year: number, now = new Date()): number {
  return Math.max(0, now.getFullYear() - year);
}

function computeNextDue(opts: {
  item: PredictiveCatalogItem;
  mileage: number;
  lastMileage: number | null;
  lastDate: string | null;
  vehicleYear: number;
  now: number;
}): {
  nextDueMileage: number;
  basedOnTypical: boolean;
  monthsRemaining: number | null;
} {
  const { item, mileage, lastMileage, lastDate, vehicleYear, now } = opts;

  if (lastMileage != null) {
    const next = lastMileage + item.intervalMiles;
    let monthsRemaining: number | null = null;
    if (item.intervalMonths != null && lastDate) {
      const elapsed = monthsBetween(lastDate, now);
      if (elapsed != null) {
        monthsRemaining = Math.max(0, item.intervalMonths - elapsed);
      }
    }
    return {
      nextDueMileage: next,
      basedOnTypical: false,
      monthsRemaining,
    };
  }

  // No history: estimate from typical cadence vs current mileage / age
  if (item.preferVehicleAge && item.intervalMonths != null) {
    const ageY = vehicleAgeYears(vehicleYear);
    const ageMonths = ageY * 12;
    const cycles = Math.floor(ageMonths / item.intervalMonths);
    const nextAgeMonths = (cycles + 1) * item.intervalMonths;
    const monthsRemaining = Math.max(0, nextAgeMonths - ageMonths);
    // Map month remaining onto a soft mileage target for sorting
    const nextDueMileage =
      mileage + Math.round((monthsRemaining / 12) * 12000);
    return {
      nextDueMileage,
      basedOnTypical: true,
      monthsRemaining,
    };
  }

  // Anchor at last full interval below current mileage
  const cycles = Math.floor(mileage / item.intervalMiles);
  const nextDueMileage = (cycles + 1) * item.intervalMiles;
  const milesRem = nextDueMileage - mileage;
  const monthsRemaining =
    item.intervalMonths != null
      ? Math.max(
          0,
          (milesRem / item.intervalMiles) * item.intervalMonths,
        )
      : milesRem / 1000; // ~1k mi / month rough for copy only

  return {
    nextDueMileage,
    basedOnTypical: true,
    monthsRemaining:
      typeof monthsRemaining === "number" ? monthsRemaining : null,
  };
}

function classifyUrgency(
  milesRemaining: number,
  monthsRemaining: number | null,
): PredictiveUrgency | null {
  if (milesRemaining <= 0) return "overdue";
  if (
    milesRemaining <= DUE_SOON_MILES ||
    (monthsRemaining != null && monthsRemaining <= DUE_SOON_MONTHS)
  ) {
    return "due_soon";
  }
  if (milesRemaining <= UPCOMING_MILES) return "upcoming";
  return null;
}

function buildHowToPrompt(
  item: PredictiveCatalogItem,
  vehicle: VehicleInfo,
): string {
  return `Help me understand a safe, educational DIY approach for "${item.title}" on my ${vehicle.year} ${vehicle.make} ${vehicle.model}. Use typical intervals (around ${item.intervalMilesMin.toLocaleString()}–${item.intervalMilesMax.toLocaleString()} mi). Confirm against the owner's manual. Do not assert that I must replace parts now.`;
}

export function evaluatePredictiveMaintenance(opts: {
  vehicle: VehicleInfo;
  records?: MaintenanceRecord[];
  maxItems?: number;
  now?: number;
  /** Skip localStorage snooze (tests) */
  ignoreSnooze?: boolean;
}): PredictiveMaintenanceCard[] {
  const {
    vehicle,
    records = [],
    maxItems = 3,
    now = Date.now(),
    ignoreSnooze = false,
  } = opts;
  const mileage = Number(vehicle.mileage) || 0;
  const cards: PredictiveMaintenanceCard[] = [];

  for (const item of PREDICTIVE_MAINTENANCE_CATALOG) {
    if (
      !ignoreSnooze &&
      isPredictiveItemSnoozed(vehicle.id, item.key, mileage, now)
    ) {
      continue;
    }

    const last = findLastService(item, records);
    const computed = computeNextDue({
      item,
      mileage,
      lastMileage: last.mileage,
      lastDate: last.date,
      vehicleYear: vehicle.year,
      now,
    });

    const milesRemaining = computed.nextDueMileage - mileage;
    const urgency = classifyUrgency(
      milesRemaining,
      computed.monthsRemaining,
    );
    if (!urgency) continue;

    cards.push({
      key: item.key,
      title: item.title,
      urgency,
      nextDueMileage: computed.nextDueMileage,
      milesRemaining,
      monthsRemaining: computed.monthsRemaining,
      difficulty: item.difficulty,
      estCostUsd: item.estCostUsd,
      coachSlug: item.coachSlug,
      howToPrompt: buildHowToPrompt(item, vehicle),
      basedOnTypicalIntervals: computed.basedOnTypical,
      lastServiceMileage: last.mileage,
      lastServiceDate: last.date,
    });
  }

  cards.sort((a, b) => {
    const ur = URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency];
    if (ur !== 0) return ur;
    return a.milesRemaining - b.milesRemaining;
  });

  return cards.slice(0, maxItems);
}

export function formatDueAroundLine(card: PredictiveMaintenanceCard): string {
  const mi = Math.max(0, Math.round(card.nextDueMileage)).toLocaleString();
  const months = card.monthsRemaining;
  if (card.urgency === "overdue") {
    return `Typically due around ${mi} mi · overdue based on common intervals`;
  }
  if (months != null && Number.isFinite(months)) {
    const m = Math.max(0, Math.round(months));
    if (m <= 0) {
      return `Due around ${mi} mi · typically due now`;
    }
    return `Due around ${mi} mi · in ~${m} month${m === 1 ? "" : "s"}`;
  }
  const miles = Math.max(0, Math.round(card.milesRemaining));
  return `Due around ${mi} mi · ~${miles.toLocaleString()} mi to go`;
}
