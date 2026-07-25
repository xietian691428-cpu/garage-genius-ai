import type { VehicleMarketCode } from "@/lib/types/vehicle-market";
import { normalizeVehicleMarket } from "@/lib/types/vehicle-market";
import type { VehicleInfo } from "@/lib/types/chat";
import { fitmentSearchString } from "@/lib/vcdb/format";

/** Env: NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG=garagegenius-20 */
export function amazonAssociateTag(): string {
  return (process.env.NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG || "").trim();
}

export function withAffiliateTag(
  url: string,
  tag = amazonAssociateTag(),
): string {
  if (!tag || !url) return url;
  try {
    const u = new URL(url);
    if (!/amazon\./i.test(u.hostname)) return url;
    if (!u.searchParams.has("tag")) u.searchParams.set("tag", tag);
    return u.toString();
  } catch {
    return url;
  }
}

const AMAZON_HOST: Record<VehicleMarketCode, string> = {
  US: "www.amazon.com",
  CA: "www.amazon.ca",
  MX: "www.amazon.com.mx",
  GB: "www.amazon.co.uk",
  EU: "www.amazon.de",
  AU: "www.amazon.com.au",
  OTHER: "www.amazon.com",
};

export type AffiliateLinkResult = {
  partLabel: string;
  shop: string;
  primaryUrl: string;
  channels: Array<{ store: string; url: string }>;
};

/** DTC → 常见零件关键词映射 */
export function partQueryForDtc(code: string, desc?: string): string {
  const c = code.toUpperCase().trim();
  const map: Record<string, string> = {
    P0300: "spark plugs ignition coil",
    P0301: "spark plug cylinder 1",
    P0420: "catalytic converter oxygen sensor",
    P0171: "mass air flow sensor fuel injector",
    P0455: "EVAP purge valve gas cap",
    C0035: "ABS wheel speed sensor",
  };
  if (map[c]) return map[c];
  if (c.startsWith("P03")) return "spark plugs ignition coil";
  if (c.startsWith("P04") && c.includes("42")) return "catalytic converter";
  if (c.startsWith("C")) return "brake pads ABS sensor";
  if (c.startsWith("B")) return "battery terminal";
  return (desc || "auto parts").replace(/[^\w\s]/g, " ").trim().slice(0, 60);
}

export function getAffiliateLinks(options: {
  part: string;
  vehicle: Pick<
    VehicleInfo,
    "year" | "make" | "model" | "submodel" | "engine" | "market"
  >;
  catalogUrls?: Partial<
    Record<"amazon" | "rockauto" | "autozone" | "oreilly", string | null>
  >;
}): AffiliateLinkResult {
  const market = normalizeVehicleMarket(options.vehicle.market);
  const fitment = fitmentSearchString(options.vehicle as VehicleInfo);
  const q = `${fitment} ${options.part}`.trim();

  const host = AMAZON_HOST[market];
  const amazonSearch = withAffiliateTag(
    `https://${host}/s?k=${encodeURIComponent(q)}`,
  );

  const shop =
    market === "US" || market === "CA"
      ? "Amazon / AutoZone / O'Reilly"
      : market === "GB" || market === "EU"
        ? "Amazon / Local EU-UK"
        : "Amazon / Local";

  const catalogAmazon = options.catalogUrls?.amazon?.trim();
  const primaryUrl = catalogAmazon
    ? withAffiliateTag(catalogAmazon)
    : amazonSearch;

  const channels: AffiliateLinkResult["channels"] = [
    { store: "Amazon", url: primaryUrl },
  ];

  if (market === "US" || market === "CA") {
    channels.push({
      store: "AutoZone",
      url:
        options.catalogUrls?.autozone?.trim() ||
        `https://www.autozone.com/search?searchText=${encodeURIComponent(q)}`,
    });
    channels.push({
      store: "O'Reilly",
      url:
        options.catalogUrls?.oreilly?.trim() ||
        `https://www.oreillyauto.com/search?q=${encodeURIComponent(q)}`,
    });
  }

  return { partLabel: options.part, shop, primaryUrl, channels };
}
