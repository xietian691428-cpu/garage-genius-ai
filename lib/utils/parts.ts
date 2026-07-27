import { inventoryService } from "@/lib/supabase-inventory";
import type { InventoryItem } from "@/lib/types/inventory";
import {
  inferInventoryCategory,
  normalizeInventoryCategory,
  type InventoryCategory,
} from "@/lib/types/parts";

export interface PartsDataItem {
  oemNumber?: string;
  brand?: string;
  name: string;
  category?: InventoryItem["category"] | string;
  quantity?: number;
  price?: number | string;
  purchaseLinks?: string[];
  /** Set when row comes from Admin affiliate_parts */
  source?: "affiliate" | "ai";
}

export const extractPartsData = (content: string): PartsDataItem[] | null => {
  const match = content.match(/<parts-data>([\s\S]*?)<\/parts-data>/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1].trim()) as PartsDataItem[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

function parsePrice(price: number | string | undefined): number {
  if (typeof price === "number") return Number.isFinite(price) ? price : 0;
  if (!price) return 0;
  const match = String(price).replace(/,/g, "").match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

export function storeLabelFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    if (host.includes("amazon")) return "Amazon";
    if (host.includes("rockauto")) return "RockAuto";
    if (host.includes("autozone")) return "AutoZone";
    if (host.includes("oreilly")) return "O'Reilly";
    return host.split(".")[0] || "Store";
  } catch {
    return "Store";
  }
}

export function formatPartsPrice(price: number | string | undefined): string {
  if (price == null || price === "") return "—";
  if (typeof price === "string" && price.includes("$")) return price;
  const n = parsePrice(price);
  return n > 0 ? `$${n.toFixed(2)}` : String(price);
}

/** Resolve a DB-safe inventory category from AI / affiliate payload. */
export function resolvePartsCategory(
  raw: string | undefined,
  name: string,
): InventoryCategory {
  return normalizeInventoryCategory(raw, name) || inferInventoryCategory(name);
}

/**
 * AI / Chat wishlist defaults:
 * - location Wishlist
 * - min_stock 0 so the row is not flagged as low stock
 * - current_stock 0 (not yet purchased)
 */
export async function savePartsToInventory(
  parts: PartsDataItem[],
  vehicleId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!vehicleId || vehicleId === "default") {
    return { ok: false, error: "Select a cloud vehicle before saving parts." };
  }
  if (!parts.length) return { ok: false, error: "No parts to save." };

  const mapped = parts.map((p) => ({
    vehicle_id: vehicleId,
    oem_number: p.oemNumber?.trim() || undefined,
    brand: p.brand || "Unknown",
    name: p.name,
    category: resolvePartsCategory(
      typeof p.category === "string" ? p.category : undefined,
      p.name,
    ),
    current_stock: 0,
    min_stock: 0,
    price: parsePrice(p.price),
    location: "Wishlist",
    purchase_links: p.purchaseLinks || [],
    notes:
      p.source === "affiliate"
        ? "Added from affiliate catalog"
        : "Added from AI recommendation",
  }));

  try {
    await inventoryService.batchUpsert(mapped);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to save to inventory",
    };
  }
}

export async function saveOnePartToInventory(
  part: PartsDataItem,
  vehicleId: string,
): Promise<{ ok: boolean; error?: string }> {
  return savePartsToInventory([part], vehicleId);
}
