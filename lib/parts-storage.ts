/**
 * Legacy localStorage inventory helpers.
 *
 * Product UI must use `inventoryService` (Supabase). This module only supports:
 * - one-time migration reads (`loadInventoryForMigration`)
 * - pure mappers used by parsers (`recommendationToInventory`)
 *
 * Write APIs are intentionally removed to prevent “saved locally but missing
 * on Parts tab” confusion.
 */

import type {
  InventoryItem,
  PartRecommendation,
  StoredInventoryItem,
} from "@/lib/types/parts";
import {
  channelsToPurchaseLinks,
  inferInventoryCategory,
  parsePriceString,
} from "@/lib/types/parts";
import { buildPurchaseChannels } from "@/lib/purchase-links";
import type { VehicleInfo } from "@/lib/types/chat";

const INVENTORY_KEY = "garageGenius_inventory";

/** @deprecated Prefer cloud inventoryService — local bag is migration-only. */
interface LegacyInventoryItem {
  id: string;
  vehicleId: string;
  name: string;
  category?: string;
  oemPartNumber?: string;
  oemNumber?: string;
  aftermarketBrand?: string;
  brand?: string;
  quantityOnHand?: number;
  currentStock?: number;
  minQuantity?: number;
  minStock?: number;
  estimatedPrice?: string;
  price?: number;
  storageLocation?: string;
  location?: string;
  purchaseChannels?: { searchUrl: string }[];
  purchaseLinks?: string[];
  notes?: string;
  lastUsedInRepair?: string;
  updatedAt?: string;
  lastUpdated?: string;
  createdAt?: string;
}

function deserializeItem(stored: StoredInventoryItem): InventoryItem {
  return {
    ...stored,
    lastUpdated: new Date(stored.lastUpdated),
  };
}

function migrateLegacyItem(raw: LegacyInventoryItem): InventoryItem {
  const channels = raw.purchaseChannels ?? [];
  const links =
    raw.purchaseLinks ??
    channels.map((c) => c.searchUrl).filter(Boolean);

  const name = raw.name ?? "Unknown part";
  const legacyCategory = raw.category;

  return {
    id: raw.id,
    vehicleId: raw.vehicleId,
    name,
    oemNumber: raw.oemNumber ?? raw.oemPartNumber ?? "",
    brand: raw.brand ?? raw.aftermarketBrand ?? "",
    category: inferInventoryCategory(
      name,
      legacyCategory === "consumable" ? "consumable" : undefined,
    ),
    currentStock: raw.currentStock ?? raw.quantityOnHand ?? 0,
    minStock: raw.minStock ?? raw.minQuantity ?? 0,
    price:
      typeof raw.price === "number"
        ? raw.price
        : parsePriceString(raw.estimatedPrice ?? ""),
    location: raw.location ?? raw.storageLocation ?? "",
    purchaseLinks: links,
    notes: raw.notes ?? "",
    lastUsedInRepair: raw.lastUsedInRepair,
    lastUpdated: new Date(
      raw.lastUpdated ?? raw.updatedAt ?? raw.createdAt ?? Date.now(),
    ),
  };
}

/**
 * Read-only access to the legacy localStorage bag (migration / diagnostics).
 * Do not use for product saves — use inventoryService instead.
 */
export function loadInventoryForMigration(vehicleId?: string): InventoryItem[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = localStorage.getItem(INVENTORY_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as (
      | StoredInventoryItem
      | LegacyInventoryItem
    )[];
    if (!Array.isArray(parsed)) return [];

    const all = parsed.map((item) => {
      if ("currentStock" in item && "oemNumber" in item) {
        return deserializeItem(item as StoredInventoryItem);
      }
      return migrateLegacyItem(item as LegacyInventoryItem);
    });

    if (!vehicleId) return all;
    return all.filter((item) => item.vehicleId === vehicleId);
  } catch {
    return [];
  }
}

/** @deprecated Use loadInventoryForMigration — name kept for older imports. */
export const loadInventory = loadInventoryForMigration;

/** Pure mapper: AI recommendation → form-shaped inventory item (no I/O). */
export function recommendationToInventory(
  rec: PartRecommendation,
  vehicle: VehicleInfo,
  options?: {
    currentStock?: number;
    minStock?: number;
    location?: string;
    lastUsedInRepair?: string;
  },
): InventoryItem {
  const channels =
    rec.purchaseChannels.length > 0
      ? rec.purchaseChannels
      : buildPurchaseChannels(rec.name, vehicle, rec.oemPartNumber);

  const fitmentNote = rec.fitment
    ? `Fitment: ${rec.fitment}`
    : `${vehicle.year} ${vehicle.make} ${vehicle.model}`;

  return {
    id: `part_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    vehicleId: vehicle.id,
    name: rec.name,
    oemNumber: rec.oemPartNumber,
    brand: rec.aftermarketBrand,
    category: inferInventoryCategory(rec.name, rec.category),
    currentStock: options?.currentStock ?? 0,
    minStock: options?.minStock ?? 0,
    price: parsePriceString(rec.estimatedPrice),
    location: options?.location ?? "Wishlist",
    purchaseLinks: channelsToPurchaseLinks(channels),
    notes: [
      rec.notes,
      rec.aftermarketPartNumber && `AM #: ${rec.aftermarketPartNumber}`,
      fitmentNote,
    ]
      .filter(Boolean)
      .join(" · "),
    lastUpdated: new Date(),
    lastUsedInRepair: options?.lastUsedInRepair,
  };
}
