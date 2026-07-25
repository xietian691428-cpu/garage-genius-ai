/**
 * Maintenance reminder rules + local snooze.
 * Shared by Dashboard UI and Next cron / Edge Function (same due logic).
 *
 * ── Review vs simplified drafts ─────────────────────────
 * ❌ Do NOT use `vehicle_vitals[].snapshot_at` as last service
 *    (that is photo/OBD diagnosis time, not an oil change).
 * ❌ Do NOT use bare `snooze_${id}` timestamp-only storage
 *    (current format is JSON `{ until, note }` under garageGenius_ prefix;
 *     legacy numeric timestamps are still read for migration).
 * ✅ Use `user_vehicles.last_maintenance` (+ optional last_service_mileage
 *    from maintenance_records in cron/Edge).
 * ✅ Prefer `evaluateServiceDue` / `shouldRemindService(vehicle: VehicleInfo)`.
 * ✅ Alias `isSnoozed` → `isReminderSnoozed` for older call sites.
 */

import type { VehicleInfo } from "@/lib/types/chat";
import { estimateMilesToService } from "@/lib/vehicle-vitals";

const SNOOZE_PREFIX = "garageGenius_reminder_snooze_";

export type ReminderSnooze = {
  until: string; // ISO
  note?: string;
};

/** Minimal vehicle shape for Edge / cron (snake or camel). */
export type ReminderVehicleInput = {
  id: string;
  year: number;
  make: string;
  model: string;
  mileage: number;
  /** YYYY-MM-DD or ISO — from user_vehicles.last_maintenance */
  lastMaintenance?: string | null;
  last_maintenance?: string | null;
  /** Optional odometer at last oil / service (from maintenance_records) */
  lastServiceMileage?: number | null;
  last_service_mileage?: number | null;
  market?: string | null;
};

export type ServiceDueResult = {
  due: boolean;
  reason: string | null;
  milesToService: number | null;
};

function snoozeKey(vehicleId: string) {
  return `${SNOOZE_PREFIX}${vehicleId}`;
}

function daysSince(iso: string | null | undefined, now = Date.now()): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.floor((now - t) / (24 * 60 * 60 * 1000));
}

function pickLastMaintenance(v: ReminderVehicleInput): string | null {
  return v.lastMaintenance ?? v.last_maintenance ?? null;
}

function pickLastServiceMileage(v: ReminderVehicleInput): number | null {
  const n = v.lastServiceMileage ?? v.last_service_mileage;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/**
 * Canonical due rules (UI + push/email cron):
 * 1) last_maintenance older than 180 days → due
 * 2) mileage − last_service_mileage > 5000 → due (when known)
 * 3) else fall back to estimateMilesToService ≤ 800 (or due-now)
 */
export function evaluateServiceDue(
  vehicle: ReminderVehicleInput,
  now = Date.now(),
): ServiceDueResult {
  const lastMaint = pickLastMaintenance(vehicle);
  const since = daysSince(lastMaint, now);
  if (since != null && since > 180) {
    return {
      due: true,
      reason: `Last recorded service was ${since} days ago`,
      milesToService: 0,
    };
  }

  const lastMiles = pickLastServiceMileage(vehicle);
  const mileage = Number(vehicle.mileage) || 0;
  if (lastMiles != null && mileage - lastMiles > 5000) {
    return {
      due: true,
      reason: `${(mileage - lastMiles).toLocaleString()} miles since last service mileage`,
      milesToService: 0,
    };
  }

  // Client VehicleInfo path — reuse existing miles heuristic
  const asInfo = {
    mileage,
    lastMaintenance: lastMaint ?? undefined,
    year: vehicle.year,
    make: vehicle.make,
    model: vehicle.model,
  } as VehicleInfo;
  const eta = estimateMilesToService(asInfo);
  if (eta.miles === 0) {
    return { due: true, reason: "Service interval looks due now", milesToService: 0 };
  }
  if (eta.miles != null && eta.miles <= 800) {
    return {
      due: true,
      reason: `About ${eta.miles} miles to next service window`,
      milesToService: eta.miles,
    };
  }

  return {
    due: false,
    reason: null,
    milesToService: eta.miles,
  };
}

export function shouldRemindService(vehicle: VehicleInfo): boolean {
  return evaluateServiceDue({
    id: vehicle.id,
    year: vehicle.year,
    make: vehicle.make,
    model: vehicle.model,
    mileage: vehicle.mileage,
    lastMaintenance: vehicle.lastMaintenance,
    market: vehicle.market,
  }).due;
}

/** @deprecated Alias — prefer isReminderSnoozed */
export function isSnoozed(vehicleId: string): boolean {
  return isReminderSnoozed(vehicleId);
}

export function loadReminderSnooze(vehicleId: string): ReminderSnooze | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(snoozeKey(vehicleId));
    if (!raw) return null;
    // Legacy: plain timestamp string from early draft
    if (/^\d+$/.test(raw)) {
      const started = Number(raw);
      return {
        until: new Date(started + 7 * 24 * 60 * 60 * 1000).toISOString(),
      };
    }
    const parsed = JSON.parse(raw) as ReminderSnooze;
    if (!parsed?.until) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function isReminderSnoozed(vehicleId: string, now = Date.now()): boolean {
  const s = loadReminderSnooze(vehicleId);
  if (!s) return false;
  const until = Date.parse(s.until);
  return Number.isFinite(until) && until > now;
}

/** Snooze in-app reminder for N days (default 7). */
export function snoozeReminder(
  vehicleId: string,
  days = 7,
  note?: string,
): ReminderSnooze {
  const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  const payload: ReminderSnooze = { until, note };
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(snoozeKey(vehicleId), JSON.stringify(payload));
    } catch {
      /* ignore */
    }
  }
  return payload;
}

export function clearReminderSnooze(vehicleId: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(snoozeKey(vehicleId));
  } catch {
    /* ignore */
  }
}

export function upcomingMaintenanceCopy(vehicle: VehicleInfo): {
  title: string;
  detail: string;
} {
  const due = evaluateServiceDue({
    id: vehicle.id,
    year: vehicle.year,
    make: vehicle.make,
    model: vehicle.model,
    mileage: vehicle.mileage,
    lastMaintenance: vehicle.lastMaintenance,
    market: vehicle.market,
  });

  if (due.due && due.milesToService === 0) {
    return {
      title: "Upcoming Maintenance",
      detail:
        due.reason ||
        "Oil / inspection looks due now — confirm mileage and last service date.",
    };
  }
  if (due.milesToService != null) {
    return {
      title: "Upcoming Maintenance",
      detail: due.reason
        ? `${due.reason}.`
        : `Oil change in ~${due.milesToService.toLocaleString()} miles`,
    };
  }
  return {
    title: "Upcoming Maintenance",
    detail: "Set your current mileage to unlock a service window estimate.",
  };
}

export function formatReminderPushBody(
  vehicle: Pick<ReminderVehicleInput, "year" | "make" | "model">,
  reason: string,
): { title: string; body: string } {
  const label = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
  return {
    title: "Garage Genius — service reminder",
    body: `Your ${label} needs attention: ${reason}`,
  };
}
