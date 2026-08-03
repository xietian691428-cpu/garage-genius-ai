/**
 * Cloud garage vehicles — Supabase user_vehicles CRUD + localStorage migration.
 */

import { supabase } from "@/lib/supabase";
import {
  loadCurrentVehicleId,
  saveCurrentVehicleId,
} from "@/lib/chat-storage";
import type { VehicleInfo } from "@/lib/types/chat";
import type { VcdbResolvedConfig } from "@/lib/types/vcdb";
import {
  DEFAULT_VEHICLE_MARKET,
  normalizeVehicleMarket,
} from "@/lib/types/vehicle-market";

const LOCAL_VEHICLES_KEY = "garageGenius_vehicles";
const MIGRATED_KEY_PREFIX = "garageGenius_vehicles_migrated_";

export type UserVehicleRow = {
  id: string;
  user_id: string;
  name: string;
  year: number;
  make: string;
  model: string;
  submodel: string | null;
  mileage: number;
  engine: string;
  transmission: string | null;
  drive_type: string | null;
  brakes: string | null;
  fuel_grade: string | null;
  oil_capacity: string | null;
  oil_viscosity: string | null;
  vin: string | null;
  license_plate?: string | null;
  last_maintenance: string | null;
  notes: string | null;
  tags: string[] | null;
  vcdb: VcdbResolvedConfig | null;
  /** Sales-market / owner-manual version (defaults to US if column missing) */
  market?: string | null;
  /** Optional insurance jurisdiction — education tips only */
  country_region?: string | null;
  country_state?: string | null;
  insurance_provider?: string | null;
  is_current: boolean;
  /** Soft-archive timestamp — null = active garage */
  archived_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

function migratedKey(userId: string) {
  return `${MIGRATED_KEY_PREFIX}${userId}`;
}

export function rowToVehicleInfo(row: UserVehicleRow): VehicleInfo {
  return {
    id: row.id,
    name: row.name,
    year: row.year,
    make: row.make,
    model: row.model,
    submodel: row.submodel ?? undefined,
    mileage: row.mileage ?? 0,
    engine: row.engine || "Unknown",
    transmission: row.transmission ?? undefined,
    driveType: row.drive_type ?? undefined,
    brakes: row.brakes ?? undefined,
    fuelGrade: row.fuel_grade ?? undefined,
    oilCapacity: row.oil_capacity ?? undefined,
    oilViscosity: row.oil_viscosity ?? undefined,
    vin: row.vin ?? undefined,
    licensePlate: row.license_plate?.trim() || undefined,
    lastMaintenance: row.last_maintenance ?? undefined,
    notes: row.notes ?? undefined,
    tags: row.tags ?? undefined,
    vcdb: row.vcdb ?? undefined,
    market: normalizeVehicleMarket(row.market),
    countryRegion: row.country_region?.trim() || undefined,
    countryState: row.country_state?.trim() || undefined,
    insuranceProvider: row.insurance_provider?.trim() || undefined,
  };
}

export function vehicleInfoToRow(
  vehicle: VehicleInfo,
  userId: string,
  options?: { isCurrent?: boolean },
): Omit<UserVehicleRow, "created_at" | "updated_at"> {
  return {
    id: vehicle.id,
    user_id: userId,
    name: vehicle.name || "My Car",
    year: Number(vehicle.year),
    make: vehicle.make,
    model: vehicle.model,
    submodel: vehicle.submodel ?? null,
    mileage: Number(vehicle.mileage) || 0,
    engine: vehicle.engine || "Unknown",
    transmission: vehicle.transmission ?? null,
    drive_type: vehicle.driveType ?? null,
    brakes: vehicle.brakes ?? null,
    fuel_grade: vehicle.fuelGrade ?? vehicle.vcdb?.fuelGrade ?? null,
    oil_capacity: vehicle.oilCapacity ?? vehicle.vcdb?.oilCapacity ?? null,
    oil_viscosity: vehicle.oilViscosity ?? vehicle.vcdb?.oilViscosity ?? null,
    vin: vehicle.vin ?? null,
    license_plate: vehicle.licensePlate?.trim() || null,
    last_maintenance: vehicle.lastMaintenance ?? null,
    notes: vehicle.notes ?? null,
    tags: vehicle.tags ?? [],
    vcdb: vehicle.vcdb ?? null,
    market: normalizeVehicleMarket(
      vehicle.market,
      DEFAULT_VEHICLE_MARKET,
    ),
    country_region: vehicle.countryRegion?.trim() || null,
    country_state: vehicle.countryState?.trim() || null,
    insurance_provider: vehicle.insuranceProvider?.trim() || null,
    is_current: options?.isCurrent ?? false,
  };
}

function readLocalVehicles(): VehicleInfo[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOCAL_VEHICLES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as VehicleInfo[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function isUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    id,
  );
}

export const userVehiclesService = {
  async list(options?: { includeArchived?: boolean }): Promise<VehicleInfo[]> {
    let query = supabase
      .from("user_vehicles")
      .select("*")
      .order("updated_at", { ascending: false });

    if (!options?.includeArchived) {
      query = query.is("archived_at", null);
    }

    const { data, error } = await query;

    // Pre-migration 021: column may not exist yet — fall back to unfiltered list.
    if (error) {
      if (!options?.includeArchived && /archived_at/i.test(error.message)) {
        const fallback = await supabase
          .from("user_vehicles")
          .select("*")
          .order("updated_at", { ascending: false });
        if (fallback.error) throw fallback.error;
        return ((fallback.data as UserVehicleRow[]) || []).map(rowToVehicleInfo);
      }
      throw error;
    }
    return ((data as UserVehicleRow[]) || []).map(rowToVehicleInfo);
  },

  async listRows(options?: { includeArchived?: boolean }): Promise<UserVehicleRow[]> {
    let query = supabase
      .from("user_vehicles")
      .select("*")
      .order("updated_at", { ascending: false });

    if (!options?.includeArchived) {
      query = query.is("archived_at", null);
    }

    const { data, error } = await query;

    if (error) {
      if (!options?.includeArchived && /archived_at/i.test(error.message)) {
        const fallback = await supabase
          .from("user_vehicles")
          .select("*")
          .order("updated_at", { ascending: false });
        if (fallback.error) throw fallback.error;
        return (fallback.data as UserVehicleRow[]) || [];
      }
      throw error;
    }
    return (data as UserVehicleRow[]) || [];
  },

  /**
   * Insert a vehicle with full VCdb config card.
   * Client may pass a temp id — we always let Postgres generate uuid unless valid.
   */
  async create(
    vehicle: VehicleInfo,
    options?: { makeCurrent?: boolean },
  ): Promise<VehicleInfo> {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) throw new Error("Sign in required to save vehicles");

    const makeCurrent = options?.makeCurrent ?? true;
    const payload = vehicleInfoToRow(vehicle, user.id, {
      isCurrent: makeCurrent,
    });

    // Drop client temp ids (Date.now strings) so Postgres assigns uuid
    const insertPayload: Record<string, unknown> = { ...payload };
    if (!isUuid(String(payload.id))) {
      delete insertPayload.id;
    }

    let { data, error } = await supabase
      .from("user_vehicles")
      .insert(insertPayload)
      .select("*")
      .single();

    // Pre-migration 034: license_plate column may not exist yet.
    if (error && /license_plate/i.test(error.message)) {
      delete insertPayload.license_plate;
      const retry = await supabase
        .from("user_vehicles")
        .insert(insertPayload)
        .select("*")
        .single();
      data = retry.data;
      error = retry.error;
    }

    if (error) throw error;
    const saved = rowToVehicleInfo(data as UserVehicleRow);
    if (makeCurrent) saveCurrentVehicleId(saved.id);
    // Keep a local mirror for offline / legacy readers
    mirrorLocalList(await userVehiclesService.list());
    return saved;
  },

  async update(vehicle: VehicleInfo): Promise<VehicleInfo> {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) throw new Error("Sign in required");

    const payload = vehicleInfoToRow(vehicle, user.id);
    const { id: _id, user_id: _uid, is_current: _cur, ...fields } = payload;

    let { data, error } = await supabase
      .from("user_vehicles")
      .update(fields)
      .eq("id", vehicle.id)
      .select("*")
      .single();

    if (error && /license_plate/i.test(error.message)) {
      const { license_plate: _lp, ...rest } = fields as Record<string, unknown>;
      const retry = await supabase
        .from("user_vehicles")
        .update(rest)
        .eq("id", vehicle.id)
        .select("*")
        .single();
      data = retry.data;
      error = retry.error;
    }

    if (error) throw error;
    const saved = rowToVehicleInfo(data as UserVehicleRow);
    mirrorLocalList(await userVehiclesService.list());
    return saved;
  },

  async setCurrent(vehicleId: string): Promise<void> {
    const { error } = await supabase
      .from("user_vehicles")
      .update({ is_current: true })
      .eq("id", vehicleId);

    if (error) throw error;
    saveCurrentVehicleId(vehicleId);
  },

  async remove(vehicleId: string): Promise<void> {
    const { error } = await supabase
      .from("user_vehicles")
      .delete()
      .eq("id", vehicleId);
    if (error) throw error;
    mirrorLocalList(await userVehiclesService.list());
  },

  /** Soft-archive — hides from active garage, keeps history/FK rows. */
  async archive(vehicleId: string): Promise<void> {
    const { error } = await supabase
      .from("user_vehicles")
      .update({ archived_at: new Date().toISOString(), is_current: false })
      .eq("id", vehicleId);
    if (error) throw error;

    const remaining = await userVehiclesService.list();
    if (remaining.length > 0) {
      await userVehiclesService.setCurrent(remaining[0].id);
    }
    mirrorLocalList(remaining);
  },

  async restore(vehicleId: string): Promise<VehicleInfo> {
    const { data, error } = await supabase
      .from("user_vehicles")
      .update({ archived_at: null })
      .eq("id", vehicleId)
      .select("*")
      .single();
    if (error) throw error;
    const saved = rowToVehicleInfo(data as UserVehicleRow);
    mirrorLocalList(await userVehiclesService.list());
    return saved;
  },

  /**
   * Load garage: migrate localStorage once, seed default if empty,
   * return vehicles + current selection.
   */
  async loadGarage(): Promise<{
    vehicles: VehicleInfo[];
    current: VehicleInfo | null;
  }> {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return { vehicles: [], current: null };
    }

    await migrateLocalVehiclesIfNeeded(user.id);

    let rows = await userVehiclesService.listRows();

    if (rows.length === 0) {
      mirrorLocalList([]);
      return { vehicles: [], current: null };
    }

    // Ensure exactly one current
    let currentRow = rows.find((r) => r.is_current);
    if (!currentRow) {
      const preferredId = loadCurrentVehicleId();
      currentRow =
        rows.find((r) => r.id === preferredId) ?? rows[0] ?? null;
      if (currentRow) {
        await userVehiclesService.setCurrent(currentRow.id);
        rows = await userVehiclesService.listRows();
        currentRow = rows.find((r) => r.id === currentRow!.id) ?? rows[0];
      }
    }

    const vehicles = rows.map(rowToVehicleInfo);
    const current = currentRow ? rowToVehicleInfo(currentRow) : vehicles[0] ?? null;
    if (current) saveCurrentVehicleId(current.id);
    mirrorLocalList(vehicles);
    return { vehicles, current };
  },
};

function mirrorLocalList(vehicles: VehicleInfo[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCAL_VEHICLES_KEY, JSON.stringify(vehicles));
  } catch {
    /* ignore quota */
  }
}

async function migrateLocalVehiclesIfNeeded(userId: string) {
  if (typeof window === "undefined") return;
  if (localStorage.getItem(migratedKey(userId)) === "1") return;

  const local = readLocalVehicles().filter(
    (v) => v.make?.trim() && v.model?.trim(),
  );
  const existing = await userVehiclesService.listRows();
  if (existing.length > 0) {
    localStorage.setItem(migratedKey(userId), "1");
    return;
  }
  if (local.length === 0) {
    localStorage.setItem(migratedKey(userId), "1");
    return;
  }

  const preferredId = loadCurrentVehicleId();
  for (let i = 0; i < local.length; i++) {
    const v = local[i];
    const makeCurrent =
      (preferredId && v.id === preferredId) || (!preferredId && i === 0);
    try {
      await userVehiclesService.create(
        { ...v, id: isUuid(v.id) ? v.id : crypto.randomUUID() },
        { makeCurrent },
      );
    } catch (err) {
      console.warn("[user-vehicles] migrate row failed:", err);
    }
  }

  localStorage.setItem(migratedKey(userId), "1");
}
