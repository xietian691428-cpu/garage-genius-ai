import type { RegionPurchasePart, RegionPartsRow } from "@/lib/types/dashboard";
import type { PartRecommendation } from "@/lib/types/parts";
import { buildPurchaseChannels } from "@/lib/purchase-links";
import type { VehicleInfo } from "@/lib/types/chat";

export function regionPartToRecommendation(
  part: RegionPurchasePart,
): PartRecommendation {
  return {
    name: part.name,
    category: part.category,
    oemPartNumber: part.oemPartNumber,
    aftermarketBrand: part.aftermarketBrand,
    aftermarketPartNumber: part.aftermarketPartNumber,
    fitment: part.fitment,
    quantityNeeded: part.quantityNeeded,
    unit: part.unit,
    estimatedPrice: part.estimatedPrice,
    purchaseChannels: part.purchaseChannels,
    installDifficulty: part.installDifficulty,
    notes: part.notes,
  };
}

export function partsTableToRecommendations(
  rows: RegionPartsRow[],
  vehicle: VehicleInfo,
): PartRecommendation[] {
  return rows.map((row) => ({
    name: row.part,
    category: "replacement" as const,
    oemPartNumber: row.oem,
    aftermarketBrand: row.aftermarket.split(" ")[0] ?? row.aftermarket,
    aftermarketPartNumber: row.aftermarket,
    fitment: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
    quantityNeeded: 1,
    unit: "each",
    estimatedPrice: row.price,
    purchaseChannels: buildPurchaseChannels(row.part, vehicle, row.oem),
  }));
}

export function getInspectionRecommendations(
  inspection: {
    purchaseParts?: RegionPurchasePart[];
    partsTable?: RegionPartsRow[];
  },
  vehicle: VehicleInfo,
): PartRecommendation[] {
  if (inspection.purchaseParts && inspection.purchaseParts.length > 0) {
    return inspection.purchaseParts.map(regionPartToRecommendation);
  }
  if (inspection.partsTable && inspection.partsTable.length > 0) {
    return partsTableToRecommendations(inspection.partsTable, vehicle);
  }
  return [];
}

/** Flatten recommendations into PartsDataItem rows for the shared table UI. */
export function recommendationsToPartsData(
  parts: PartRecommendation[],
): import("@/lib/utils/parts").PartsDataItem[] {
  return parts.map((p) => ({
    oemNumber: p.oemPartNumber,
    brand: p.aftermarketBrand,
    name: p.name,
    // Pass through AI category; savePartsToInventory normalizes to DB whitelist
    category: p.category,
    quantity: p.quantityNeeded,
    price: p.estimatedPrice,
    purchaseLinks: p.purchaseChannels.map((c) => c.searchUrl).filter(Boolean),
    source: p.notes?.toLowerCase().includes("affiliate")
      ? ("affiliate" as const)
      : ("ai" as const),
  }));
}
