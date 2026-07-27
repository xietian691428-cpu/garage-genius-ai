/**
 * Cloud maintenance history — Supabase maintenance_records.
 */

import { supabase } from "@/lib/supabase";
import {
  FREE_MAINTENANCE_PREVIEW,
  maintenanceListLimit,
} from "@/lib/history-limits";
import type {
  MaintenanceRecord,
  MaintenanceRecordInput,
  MaintenanceRecordUpdate,
  MaintenanceSource,
} from "@/lib/types/maintenance";

type MaintenanceRow = {
  id: string;
  user_id: string;
  vehicle_id: string;
  title: string;
  category: string;
  description: string | null;
  mileage: number | null;
  cost_cents: number | null;
  parts_used: unknown;
  shop_name?: string | null;
  performed_at: string;
  source: MaintenanceSource;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

function rowToRecord(row: MaintenanceRow): MaintenanceRecord {
  return {
    id: row.id,
    userId: row.user_id,
    vehicleId: row.vehicle_id,
    title: row.title,
    category: row.category,
    description: row.description ?? undefined,
    mileage: row.mileage ?? undefined,
    costCents: row.cost_cents ?? undefined,
    partsUsed: Array.isArray(row.parts_used) ? row.parts_used : [],
    shopName: row.shop_name ?? undefined,
    performedAt: row.performed_at,
    source: row.source,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const maintenanceService = {
  async list(options: {
    vehicleId?: string | null;
    isPro: boolean;
  }): Promise<{ records: MaintenanceRecord[]; truncated: boolean; total: number }> {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return { records: [], truncated: false, total: 0 };
    }

    let query = supabase
      .from("maintenance_records")
      .select("*", { count: "exact" })
      .eq("user_id", user.id)
      .order("performed_at", { ascending: false })
      .order("created_at", { ascending: false });

    if (options.vehicleId) {
      query = query.eq("vehicle_id", options.vehicleId);
    }

    const limit = maintenanceListLimit(options.isPro);
    if (limit != null) {
      query = query.limit(limit);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    const total = count ?? (data?.length ?? 0);
    const records = ((data as MaintenanceRow[]) || []).map(rowToRecord);
    const truncated =
      !options.isPro && total > FREE_MAINTENANCE_PREVIEW;

    return { records, truncated, total };
  },

  async create(input: MaintenanceRecordInput): Promise<MaintenanceRecord> {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) throw new Error("Sign in required");

    const { data, error } = await supabase
      .from("maintenance_records")
      .insert({
        user_id: user.id,
        vehicle_id: input.vehicleId,
        title: input.title.trim(),
        category: input.category ?? "general",
        description: input.description?.trim() || null,
        mileage: input.mileage ?? null,
        cost_cents: input.costCents ?? null,
        parts_used: input.partsUsed ?? [],
        shop_name: input.shopName?.trim() || null,
        performed_at: input.performedAt,
        source: input.source ?? "manual",
        notes: input.notes?.trim() || null,
      })
      .select("*")
      .single();

    if (error) throw error;
    return rowToRecord(data as MaintenanceRow);
  },

  async update(
    id: string,
    patch: MaintenanceRecordUpdate,
  ): Promise<MaintenanceRecord> {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) throw new Error("Sign in required");

    const payload: Record<string, unknown> = {};
    if (patch.vehicleId !== undefined) payload.vehicle_id = patch.vehicleId;
    if (patch.title !== undefined) payload.title = patch.title.trim();
    if (patch.category !== undefined) payload.category = patch.category;
    if (patch.description !== undefined) {
      payload.description = patch.description?.trim() || null;
    }
    if (patch.mileage !== undefined) payload.mileage = patch.mileage ?? null;
    if (patch.costCents !== undefined) payload.cost_cents = patch.costCents ?? null;
    if (patch.partsUsed !== undefined) payload.parts_used = patch.partsUsed ?? [];
    if (patch.shopName !== undefined) {
      payload.shop_name = patch.shopName?.trim() || null;
    }
    if (patch.performedAt !== undefined) payload.performed_at = patch.performedAt;
    if (patch.source !== undefined) payload.source = patch.source;
    if (patch.notes !== undefined) payload.notes = patch.notes?.trim() || null;

    const { data, error } = await supabase
      .from("maintenance_records")
      .update(payload)
      .eq("id", id)
      .eq("user_id", user.id)
      .select("*")
      .single();

    if (error) throw error;
    return rowToRecord(data as MaintenanceRow);
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase
      .from("maintenance_records")
      .delete()
      .eq("id", id);
    if (error) throw error;
  },
};
