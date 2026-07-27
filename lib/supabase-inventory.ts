/**
 * Cloud parts inventory — Supabase inventory_items (per vehicle_id + user_id).
 */

import { supabase } from "@/lib/supabase";
import type { InventoryItem } from "@/lib/types/inventory";
import { normalizeInventoryCategory } from "@/lib/types/parts";

const MIGRATED_KEY_PREFIX = "garageGenius_inventory_migrated_";

export type InventoryUpsert = Omit<InventoryItem, "id" | "last_updated"> & {
  id?: string;
};

function migratedKey(userId: string, vehicleId: string) {
  return `${MIGRATED_KEY_PREFIX}${userId}_${vehicleId}`;
}

function isCloudRowId(id: string | undefined | null): boolean {
  if (!id) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    id,
  );
}

export const inventoryService = {
  async getInventory(vehicleId: string): Promise<InventoryItem[]> {
    if (!vehicleId) return [];

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) return [];

    const { data, error } = await supabase
      .from("inventory_items")
      .select("*")
      .eq("vehicle_id", vehicleId)
      .eq("user_id", user.id)
      .order("last_updated", { ascending: false });

    if (error) throw error;
    return (data as InventoryItem[]) || [];
  },

  async upsertItem(item: InventoryUpsert): Promise<InventoryItem> {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) throw new Error("Sign in required to save inventory");

    const category = normalizeInventoryCategory(item.category, item.name);

    // Prefer primary-key update when editing an existing cloud row (keeps id
    // stable even if OEM is cleared / regenerated).
    if (isCloudRowId(item.id)) {
      const oem =
        item.oem_number?.trim() ||
        `manual-${crypto.randomUUID().slice(0, 8)}`;

      const { data, error } = await supabase
        .from("inventory_items")
        .update({
          vehicle_id: item.vehicle_id,
          oem_number: oem,
          brand: item.brand,
          name: item.name,
          category,
          current_stock: item.current_stock,
          min_stock: item.min_stock,
          price: item.price,
          location: item.location,
          purchase_links: item.purchase_links ?? [],
          notes: item.notes ?? null,
          last_used_in_repair: item.last_used_in_repair ?? null,
          user_id: user.id,
          last_updated: new Date().toISOString(),
        })
        .eq("id", item.id!)
        .eq("user_id", user.id)
        .select()
        .single();

      if (error) throw error;
      return data as InventoryItem;
    }

    const oem =
      item.oem_number?.trim() ||
      `manual-${crypto.randomUUID().slice(0, 8)}`;

    const payload = {
      vehicle_id: item.vehicle_id,
      oem_number: oem,
      brand: item.brand,
      name: item.name,
      category,
      current_stock: item.current_stock,
      min_stock: item.min_stock,
      price: item.price,
      location: item.location,
      purchase_links: item.purchase_links ?? [],
      notes: item.notes ?? null,
      last_used_in_repair: item.last_used_in_repair ?? null,
      user_id: user.id,
      last_updated: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("inventory_items")
      .upsert(payload, { onConflict: "oem_number,vehicle_id" })
      .select()
      .single();

    if (error) throw error;
    return data as InventoryItem;
  },

  async batchUpsert(
    items: Array<Omit<InventoryItem, "id" | "last_updated">>,
  ): Promise<InventoryItem[]> {
    if (!items.length) return [];

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) throw new Error("Sign in required to save inventory");

    const { data, error } = await supabase
      .from("inventory_items")
      .upsert(
        items.map((item) => ({
          ...item,
          category: normalizeInventoryCategory(item.category, item.name),
          oem_number:
            item.oem_number?.trim() ||
            `ai-${crypto.randomUUID().slice(0, 8)}`,
          user_id: user.id,
          last_updated: new Date().toISOString(),
        })),
        { onConflict: "oem_number,vehicle_id" },
      )
      .select();

    if (error) throw error;
    return (data as InventoryItem[]) || [];
  },

  async updateStock(id: string, newStock: number, repairId?: string) {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) throw new Error("Sign in required");

    const { data, error } = await supabase
      .from("inventory_items")
      .update({
        current_stock: newStock,
        last_updated: new Date().toISOString(),
        ...(repairId ? { last_used_in_repair: repairId } : {}),
      })
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .single();

    if (error) throw error;
    return data as InventoryItem;
  },

  async remove(id: string): Promise<void> {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) throw new Error("Sign in required");

    const { error } = await supabase
      .from("inventory_items")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) throw error;
  },

  async getLowStock(vehicleId: string): Promise<InventoryItem[]> {
    const items = await inventoryService.getInventory(vehicleId);
    return items.filter(isLowStockItem);
  },
};

/** Wishlist with min_stock 0 should not flash as "low stock". */
export function isLowStockItem(item: Pick<InventoryItem, "current_stock" | "min_stock" | "location">): boolean {
  if (item.location === "Wishlist" && item.min_stock <= 0) return false;
  return item.min_stock > 0 && item.current_stock <= item.min_stock;
}

/**
 * One-time migrate legacy localStorage inventory into cloud for this vehicle.
 * Read-only on localStorage — never write back to the legacy bag from product UI.
 */
export async function migrateFromLocalStorage(vehicleId: string): Promise<void> {
  if (typeof window === "undefined" || !vehicleId) return;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const flag = migratedKey(user.id, vehicleId);
  if (localStorage.getItem(flag) === "1") return;

  const oldData = localStorage.getItem("garageGenius_inventory");
  if (!oldData) {
    localStorage.setItem(flag, "1");
    return;
  }

  try {
    const oldItems = JSON.parse(oldData) as Array<Record<string, unknown>>;
    if (!Array.isArray(oldItems) || oldItems.length === 0) {
      localStorage.setItem(flag, "1");
      return;
    }

    // Only migrate rows tagged for this vehicle (avoids dumping one bag onto every car).
    const tagged = oldItems.filter(
      (item) => String(item.vehicleId ?? "") === vehicleId,
    );
    if (tagged.length === 0) {
      localStorage.setItem(flag, "1");
      return;
    }

    const newItems = tagged.map((item) => ({
      vehicle_id: vehicleId,
      oem_number: String(
        item.oemNumber || item.oemPartNumber || "",
      ).trim() || undefined,
      brand: String(item.brand || item.aftermarketBrand || "Unknown"),
      name: String(item.name || "Unknown part"),
      category: normalizeInventoryCategory(
        String(item.category || ""),
        String(item.name || ""),
      ),
      current_stock: Number(item.currentStock ?? item.quantityOnHand ?? 0) || 0,
      min_stock: Number(item.minStock ?? item.minQuantity ?? 0) || 0,
      price:
        typeof item.price === "string"
          ? parseFloat(String(item.price).replace(/[^0-9.]/g, "")) || 0
          : Number(item.price) || 0,
      location: String(item.location || item.storageLocation || "Garage Shelf"),
      purchase_links: Array.isArray(item.purchaseLinks)
        ? (item.purchaseLinks as string[])
        : [],
      notes: String(item.notes || ""),
    }));

    await inventoryService.batchUpsert(newItems);
    localStorage.setItem(flag, "1");
  } catch (e) {
    console.error("[inventory] Migration failed:", e);
  }
}
