/**
 * Cloud parts inventory — Supabase inventory_items (per vehicle_id + user_id).
 */

import { supabase } from "@/lib/supabase";
import type { InventoryItem } from "@/lib/types/inventory";

const MIGRATED_KEY_PREFIX = "garageGenius_inventory_migrated_";

export type InventoryUpsert = Omit<InventoryItem, "id" | "last_updated"> & {
  id?: string;
};

function migratedKey(userId: string, vehicleId: string) {
  return `${MIGRATED_KEY_PREFIX}${userId}_${vehicleId}`;
}

export const inventoryService = {
  async getInventory(vehicleId: string): Promise<InventoryItem[]> {
    if (!vehicleId) return [];

    const { data, error } = await supabase
      .from("inventory_items")
      .select("*")
      .eq("vehicle_id", vehicleId)
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

    const oem =
      item.oem_number?.trim() ||
      // Unique index on (oem_number, vehicle_id) — avoid empty-string collisions
      `manual-${crypto.randomUUID().slice(0, 8)}`;

    const payload = {
      ...item,
      oem_number: oem,
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
    const { data, error } = await supabase
      .from("inventory_items")
      .update({
        current_stock: newStock,
        last_updated: new Date().toISOString(),
        ...(repairId ? { last_used_in_repair: repairId } : {}),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data as InventoryItem;
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase
      .from("inventory_items")
      .delete()
      .eq("id", id);
    if (error) throw error;
  },

  async getLowStock(vehicleId: string): Promise<InventoryItem[]> {
    const items = await inventoryService.getInventory(vehicleId);
    return items.filter((i) => i.current_stock <= i.min_stock);
  },
};

/**
 * One-time migrate legacy localStorage inventory into cloud for this vehicle.
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

    // Prefer items already tagged for this vehicle; otherwise migrate all once
    // onto the first cloud vehicle the user opens.
    const tagged = oldItems.filter(
      (item) => String(item.vehicleId ?? "") === vehicleId,
    );
    const source = tagged.length > 0 ? tagged : oldItems;

    const newItems = source.map((item) => ({
      vehicle_id: vehicleId,
      oem_number: String(
        item.oemNumber || item.oemPartNumber || "",
      ).trim() || undefined,
      brand: String(item.brand || item.aftermarketBrand || "Unknown"),
      name: String(item.name || "Unknown part"),
      category: inferCategory(String(item.name || "")),
      current_stock: Number(item.currentStock ?? item.quantityOnHand ?? 0) || 0,
      min_stock: Number(item.minStock ?? item.minQuantity ?? 1) || 1,
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

function inferCategory(name: string): InventoryItem["category"] {
  const n = name.toLowerCase();
  if (n.includes("brake") || n.includes("pad") || n.includes("rotor")) {
    return "brake";
  }
  if (n.includes("oil") || n.includes("filter")) return "filter";
  if (n.includes("engine")) return "engine";
  if (
    n.includes("shock") ||
    n.includes("strut") ||
    n.includes("control arm")
  ) {
    return "suspension";
  }
  if (n.includes("battery") || n.includes("alternator")) return "electrical";
  return "consumable";
}
