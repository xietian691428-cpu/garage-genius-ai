import { inventoryService } from "@/lib/supabase-inventory";
import type { InventoryItem } from "@/lib/types/inventory";

export interface PartsDataItem {
  oemNumber?: string;
  brand?: string;
  name: string;
  category?: InventoryItem["category"];
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
    category: p.category || inferCategory(p.name),
    current_stock: 0,
    min_stock: 1,
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
