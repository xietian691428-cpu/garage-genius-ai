import type { PurchaseChannel } from "@/lib/types/parts";
import type { VehicleInfo } from "@/lib/types/chat";
import { fitmentSearchString } from "@/lib/vcdb/format";
import { getAffiliateLinks, withAffiliateTag } from "@/lib/affiliate-links";
import { normalizeVehicleMarket } from "@/lib/types/vehicle-market";

/**
 * Market-aware purchase search links for Chat / Dashboard / inventory.
 * Keeps signature stable: (partName, vehicle, oem?) → PurchaseChannel[]
 * Amazon host + Associates tag come from lib/affiliate-links.
 */
export function buildPurchaseChannels(
  partName: string,
  vehicle: VehicleInfo,
  oemPartNumber?: string,
): PurchaseChannel[] {
  const fitment = fitmentSearchString(vehicle);
  const baseQuery = `${fitment} ${partName}`.trim();
  const oemQuery = oemPartNumber
    ? `${fitment} ${oemPartNumber}`.trim()
    : baseQuery;
  const market = normalizeVehicleMarket(vehicle.market);

  // Prefer part name for shoppable search; OEM deep-link goes to RockAuto below.
  const aff = getAffiliateLinks({ part: partName, vehicle });

  const channels: PurchaseChannel[] = aff.channels.map((c) => ({
    store: c.store,
    searchQuery: baseQuery,
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
    channels.splice(insertAt, 0, {
      store: "RockAuto",
      searchQuery: oemPartNumber || baseQuery,
      searchUrl: oemPartNumber
        ? `https://www.rockauto.com/en/partsearch/?partnum=${encodeURIComponent(oemPartNumber)}`
        : `https://www.rockauto.com/en/catalog/`,
    });
  }

  // If OEM known, tighten Amazon query on the same market host + tag.
  return channels.map((ch) => {
    if (ch.store !== "Amazon") return ch;
    if (!oemPartNumber) {
      return { ...ch, searchUrl: withAffiliateTag(ch.searchUrl) };
    }
    try {
      const u = new URL(ch.searchUrl);
      u.searchParams.set("k", oemQuery);
      return {
        ...ch,
        searchQuery: oemQuery,
        searchUrl: withAffiliateTag(u.toString()),
      };
    } catch {
      return { ...ch, searchUrl: withAffiliateTag(ch.searchUrl) };
    }
  });
}
