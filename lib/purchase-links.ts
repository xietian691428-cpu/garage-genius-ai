import type { PurchaseChannel } from "@/lib/types/parts";
import type { VehicleInfo } from "@/lib/types/chat";
import { fitmentSearchString } from "@/lib/vcdb/format";
import {
  buildAmazonPartSearchQuery,
  buildAmazonSearchUrl,
  getAffiliateLinks,
} from "@/lib/affiliate-links";
import { normalizeVehicleMarket } from "@/lib/types/vehicle-market";

/**
 * Market-aware purchase search links for Chat / Dashboard / inventory.
 * Amazon always uses keyword search (year + make + model + part) — no product deep links.
 */
export function buildPurchaseChannels(
  partName: string,
  vehicle: VehicleInfo,
  oemPartNumber?: string,
): PurchaseChannel[] {
  const fitment = fitmentSearchString(vehicle);
  const baseQuery = buildAmazonPartSearchQuery(vehicle, partName, oemPartNumber);
  const market = normalizeVehicleMarket(vehicle.market);

  const aff = getAffiliateLinks({
    part: partName,
    vehicle,
    oemPartNumber,
  });

  const channels: PurchaseChannel[] = aff.channels.map((c) => ({
    store: c.store,
    searchQuery: c.searchQuery || baseQuery,
    searchUrl: c.url,
  }));

  // RockAuto is strongest for US/CA/MX OEM lookups (not EU/UK primary).
  if (
    market === "US" ||
    market === "CA" ||
    market === "MX" ||
    market === "OTHER"
  ) {
    const amazonIdx = channels.findIndex((c) => c.store === "Amazon");
    const insertAt = amazonIdx >= 0 ? amazonIdx + 1 : 0;
    const rockQuery = oemPartNumber || `${fitment} ${partName}`.trim();
    channels.splice(insertAt, 0, {
      store: "RockAuto",
      searchQuery: rockQuery,
      searchUrl: oemPartNumber
        ? `https://www.rockauto.com/en/partsearch/?partnum=${encodeURIComponent(oemPartNumber)}`
        : `https://www.rockauto.com/en/catalog/`,
    });
  }

  // Guarantee Amazon channel is keyword search with accurate query
  return channels.map((ch) => {
    if (ch.store !== "Amazon") return ch;
    return {
      store: "Amazon",
      searchQuery: baseQuery,
      searchUrl: buildAmazonSearchUrl(baseQuery, vehicle.market),
    };
  });
}
