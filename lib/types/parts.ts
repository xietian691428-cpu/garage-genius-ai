export type InventoryCategory =
  | "brake"
  | "engine"
  | "filter"
  | "suspension"
  | "electrical"
  | "consumable"
  | "other";

export type StockStatus = "in_stock" | "low" | "out";

export interface PurchaseChannel {
  store: string;
  searchQuery: string;
  searchUrl: string;
}

/** AI 推荐的配件（购买前，字段与 Chat/Dashboard 输出对齐） */
export interface PartRecommendation {
  name: string;
  category: "replacement" | "consumable";
  oemPartNumber: string;
  aftermarketBrand: string;
  aftermarketPartNumber: string;
  fitment: string;
  quantityNeeded: number;
  unit: string;
  estimatedPrice: string;
  purchaseChannels: PurchaseChannel[];
  installDifficulty?: "Easy" | "Medium" | "Hard";
  notes?: string;
}

/** 用户库存中的配件 */
export interface InventoryItem {
  id: string;
  oemNumber: string;
  brand: string;
  name: string;
  category: InventoryCategory;
  currentStock: number;
  minStock: number;
  price: number;
  location: string;
  lastUpdated: Date;
  purchaseLinks: string[];
  notes: string;
  vehicleId: string;
  lastUsedInRepair?: string;
}

/** localStorage 序列化格式 */
export interface StoredInventoryItem
  extends Omit<InventoryItem, "lastUpdated"> {
  lastUpdated: string;
}

export function getStockStatus(item: InventoryItem): StockStatus {
  if (item.currentStock <= 0) return "out";
  if (item.currentStock <= item.minStock) return "low";
  return "in_stock";
}

/** 从 AI 价格字符串提取数字（取第一个金额，如 "$45–$65" → 45） */
export function parsePriceString(price: string): number {
  const match = price.replace(/,/g, "").match(/\d+(?:\.\d+)?/);
  return match ? parseFloat(match[0]) : 0;
}

/** 根据零件名称推断库存分类 */
export function inferInventoryCategory(
  name: string,
  aiCategory?: string,
): InventoryCategory {
  const n = name.toLowerCase();

  if (
    aiCategory === "consumable" ||
    n.includes("oil") ||
    n.includes("fluid") ||
    n.includes("coolant") ||
    n.includes("wiper")
  ) {
    return "consumable";
  }
  if (
    n.includes("brake") ||
    n.includes("pad") ||
    n.includes("rotor") ||
    n.includes("caliper")
  ) {
    return "brake";
  }
  if (n.includes("filter")) return "filter";
  if (
    n.includes("battery") ||
    n.includes("alternator") ||
    n.includes("spark") ||
    n.includes("fuse") ||
    n.includes("electrical")
  ) {
    return "electrical";
  }
  if (
    n.includes("shock") ||
    n.includes("strut") ||
    n.includes("suspension") ||
    n.includes("control arm")
  ) {
    return "suspension";
  }
  if (
    n.includes("engine") ||
    n.includes("belt") ||
    n.includes("gasket") ||
    n.includes("piston") ||
    n.includes("timing")
  ) {
    return "engine";
  }
  return "other";
}

export function channelsToPurchaseLinks(
  channels: PurchaseChannel[],
): string[] {
  return channels.map((ch) => ch.searchUrl).filter(Boolean);
}

export const INVENTORY_CATEGORY_LABELS: Record<InventoryCategory, string> = {
  brake: "Brake",
  engine: "Engine",
  filter: "Filter",
  suspension: "Suspension",
  electrical: "Electrical",
  consumable: "Consumable",
  other: "Other",
};

export const INVENTORY_CATEGORIES: InventoryCategory[] = [
  "brake",
  "engine",
  "filter",
  "suspension",
  "electrical",
  "consumable",
  "other",
];

/** Map AI / free-text categories onto DB check constraint values. */
export function normalizeInventoryCategory(
  raw: string | null | undefined,
  nameHint?: string,
): InventoryCategory {
  const v = (raw || "").trim().toLowerCase();
  if ((INVENTORY_CATEGORIES as string[]).includes(v)) {
    return v as InventoryCategory;
  }
  // Common AI aliases
  if (v === "replacement" || v === "wear" || v === "part") {
    return inferInventoryCategory(nameHint || "", undefined);
  }
  if (v === "brakes" || v === "brake pads") return "brake";
  if (v === "oils" || v === "fluids" || v === "fluid") return "consumable";
  if (v === "filters") return "filter";
  if (v === "electric" || v === "electronics") return "electrical";
  if (v === "suspensions") return "suspension";
  return inferInventoryCategory(nameHint || v, undefined);
}
