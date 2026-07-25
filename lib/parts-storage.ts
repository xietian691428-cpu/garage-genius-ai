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

/** 旧版 localStorage 结构 → 新版迁移 */
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
    minStock: raw.minStock ?? raw.minQuantity ?? 1,
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

function readAll(): InventoryItem[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = localStorage.getItem(INVENTORY_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as (StoredInventoryItem | LegacyInventoryItem)[];
    if (!Array.isArray(parsed)) return [];

    return parsed.map((item) => {
      if ("currentStock" in item && "oemNumber" in item) {
        return deserializeItem(item as StoredInventoryItem);
      }
      return migrateLegacyItem(item as LegacyInventoryItem);
    });
  } catch {
    return [];
  }
}

function serializeItem(item: InventoryItem): StoredInventoryItem {
  return {
    ...item,
    lastUpdated: item.lastUpdated.toISOString(),
  };
}

function writeAll(items: InventoryItem[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    INVENTORY_KEY,
    JSON.stringify(items.map(serializeItem)),
  );
}

export function loadInventory(vehicleId?: string): InventoryItem[] {
  const all = readAll();
  if (!vehicleId) return all;
  return all.filter((item) => item.vehicleId === vehicleId);
}

export function saveInventoryItem(item: InventoryItem): void {
  const all = readAll();
  const index = all.findIndex((i) => i.id === item.id);
  const toSave: InventoryItem = {
    ...item,
    lastUpdated: new Date(),
  };

  if (index >= 0) {
    all[index] = toSave;
  } else {
    all.push(toSave);
  }
  writeAll(all);
}

export function deleteInventoryItem(id: string): void {
  writeAll(readAll().filter((item) => item.id !== id));
}

export function updateStock(id: string, delta: number): InventoryItem | null {
  const all = readAll();
  const index = all.findIndex((i) => i.id === id);
  if (index < 0) return null;

  const updated: InventoryItem = {
    ...all[index],
    currentStock: Math.max(0, all[index].currentStock + delta),
    lastUpdated: new Date(),
  };
  all[index] = updated;
  writeAll(all);
  return updated;
}

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
    currentStock: options?.currentStock ?? rec.quantityNeeded ?? 1,
    minStock: options?.minStock ?? (rec.category === "consumable" ? 1 : 0),
    price: parsePriceString(rec.estimatedPrice),
    location: options?.location ?? "",
    purchaseLinks: channelsToPurchaseLinks(channels),
    notes: [rec.notes, rec.aftermarketPartNumber && `AM #: ${rec.aftermarketPartNumber}`, fitmentNote]
      .filter(Boolean)
      .join(" · "),
    lastUpdated: new Date(),
    lastUsedInRepair: options?.lastUsedInRepair,
  };
}

export function addRecommendationsToInventory(
  recs: PartRecommendation[],
  vehicle: VehicleInfo,
): InventoryItem[] {
  const added = recs.map((rec) =>
    recommendationToInventory(rec, vehicle, {
      currentStock: 0,
      minStock: rec.category === "consumable" ? 1 : 0,
    }),
  );
  added.forEach(saveInventoryItem);
  return added;
}
