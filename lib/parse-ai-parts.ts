import type { PartRecommendation } from "@/lib/types/parts";
import { buildPurchaseChannels } from "@/lib/purchase-links";
import type { VehicleInfo } from "@/lib/types/chat";
import type { InventoryItem } from "@/lib/types/parts";
import { recommendationToInventory } from "@/lib/parts-storage";

const PARTS_JSON_REGEX = /```parts-json\s*\n([\s\S]*?)\n```/;
const PARTS_DATA_REGEX = /<parts-data>\s*([\s\S]*?)\s*<\/parts-data>/i;

type RawPart = Partial<PartRecommendation> & {
  oemNumber?: string;
  oem?: string;
  brandName?: string;
  brand?: string;
  aftermarket?: string;
  aftermarketNumber?: string;
  category?: string;
  price?: string | number;
  qty?: number;
  quantity?: number;
  purchaseLinks?: string[];
};

function normalizeRawPart(raw: RawPart): PartRecommendation | null {
  const name = raw.name?.trim();
  if (!name) return null;

  return {
    name,
    category:
      raw.category === "consumable" || raw.category === "replacement"
        ? raw.category
        : "replacement",
    oemPartNumber:
      raw.oemPartNumber?.trim() ||
      raw.oemNumber?.trim() ||
      raw.oem?.trim() ||
      "",
    aftermarketBrand:
      raw.aftermarketBrand?.trim() ||
      raw.brand?.trim() ||
      raw.brandName?.trim() ||
      "",
    aftermarketPartNumber:
      raw.aftermarketPartNumber?.trim() ||
      raw.aftermarketNumber?.trim() ||
      raw.aftermarket?.trim() ||
      "",
    fitment: raw.fitment?.trim() || "",
    quantityNeeded: raw.quantityNeeded ?? raw.qty ?? raw.quantity ?? 1,
    unit: raw.unit?.trim() || "each",
    estimatedPrice:
      raw.estimatedPrice?.trim() ||
      (typeof raw.price === "number" ? String(raw.price) : raw.price?.trim()) ||
      "",
    purchaseChannels: Array.isArray(raw.purchaseChannels)
      ? raw.purchaseChannels
      : Array.isArray(raw.purchaseLinks)
        ? raw.purchaseLinks.map((link) => ({
            store: "Store",
            searchQuery: name,
            searchUrl: link,
          }))
        : [],
    installDifficulty: raw.installDifficulty,
    notes: raw.notes?.trim(),
  };
}

function parsePartsPayload(jsonText: string): PartRecommendation[] {
  try {
    const parsed = JSON.parse(jsonText) as RawPart | RawPart[];
    const list = Array.isArray(parsed) ? parsed : [parsed];
    return list
      .map(normalizeRawPart)
      .filter((p): p is PartRecommendation => p !== null);
  } catch {
    return [];
  }
}

function enrichPart(
  part: PartRecommendation,
  vehicle?: VehicleInfo,
): PartRecommendation {
  if (part.purchaseChannels.length > 0 || !vehicle) return part;

  return {
    ...part,
    fitment:
      part.fitment || `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
    purchaseChannels: buildPurchaseChannels(
      part.name,
      vehicle,
      part.oemPartNumber,
    ),
  };
}

export function stripPartsDataFromContent(content: string): string {
  return content
    .replace(PARTS_DATA_REGEX, "")
    .replace(PARTS_JSON_REGEX, "")
    .trim();
}

/** @deprecated use stripPartsDataFromContent */
export const stripPartsJsonFromContent = stripPartsDataFromContent;

export function extractPartsFromContent(
  content: string,
  vehicle?: VehicleInfo,
): PartRecommendation[] {
  const dataMatch = content.match(PARTS_DATA_REGEX);
  if (dataMatch?.[1]) {
    const parts = parsePartsPayload(dataMatch[1]);
    if (parts.length > 0) {
      return parts.map((p) => enrichPart(p, vehicle));
    }
  }

  const jsonMatch = content.match(PARTS_JSON_REGEX);
  if (jsonMatch?.[1]) {
    const parts = parsePartsPayload(jsonMatch[1]);
    if (parts.length > 0) {
      return parts.map((p) => enrichPart(p, vehicle));
    }
  }

  return [];
}

export function extractInventoryItemsFromContent(
  content: string,
  vehicle: VehicleInfo,
): InventoryItem[] {
  const parts = extractPartsFromContent(content, vehicle);
  if (parts.length === 0) return [];

  return parts.map((part) =>
    recommendationToInventory(part, vehicle, {
      currentStock: 0,
      minStock: part.category === "consumable" ? 1 : 0,
    }),
  );
}
