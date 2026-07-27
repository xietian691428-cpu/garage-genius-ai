import type { VehicleMarketCode } from "@/lib/types/vehicle-market";
import { normalizeVehicleMarket } from "@/lib/types/vehicle-market";
import type { VehicleInfo } from "@/lib/types/chat";
import { fitmentSearchString } from "@/lib/vcdb/format";

/**
 * Associates tag (placeholder for a future deep-link / tagged phase).
 * Accepts either name; neither is applied to URLs in the current search-only mode.
 * - AMAZON_ASSOCIATES_TAG
 * - NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG
 */
export function amazonAssociateTag(): string {
  return (
    process.env.AMAZON_ASSOCIATES_TAG ||
    process.env.NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG ||
    ""
  ).trim();
}

/**
 * Opt-in only. Current product phase uses untagged keyword search.
 * Set AMAZON_AFFILIATE_DEEP_LINKS=1 later to re-apply Associates tags.
 */
export function amazonAffiliateDeepLinksEnabled(): boolean {
  return (
    process.env.AMAZON_AFFILIATE_DEEP_LINKS === "1" ||
    process.env.NEXT_PUBLIC_AMAZON_AFFILIATE_DEEP_LINKS === "1"
  );
}

/** Attach Associates tag when (and only when) deep-link mode is enabled. */
export function withAffiliateTag(
  url: string,
  tag = amazonAssociateTag(),
): string {
  if (!amazonAffiliateDeepLinksEnabled() || !tag || !url) return url;
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
  /** Always an Amazon keyword search URL in the current phase */
  primaryUrl: string;
  /** Human-readable search keywords shown to the user */
  searchQuery: string;
  channels: Array<{ store: string; url: string; searchQuery?: string }>;
};

type VehicleFitment = Pick<
  VehicleInfo,
  "year" | "make" | "model" | "submodel" | "engine" | "market"
>;

/**
 * Clear Amazon search keywords: year + make + model (+ optional submodel) + part.
 * Example: "2022 Toyota RAV4 ceramic brake pads"
 */
export function buildAmazonPartSearchQuery(
  vehicle: VehicleFitment | null | undefined,
  partName: string,
  oemPartNumber?: string | null,
): string {
  const part = (partName || "auto parts").replace(/\s+/g, " ").trim();
  const ymm = vehicle
    ? [vehicle.year, vehicle.make, vehicle.model, vehicle.submodel]
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim()
    : "";
  let q = ymm ? `${ymm} ${part}` : part;
  const oem = (oemPartNumber || "").trim();
  // Append short OEM for precision when it isn't already in the query
  if (oem && oem.length <= 24 && !q.toLowerCase().includes(oem.toLowerCase())) {
    q = `${q} ${oem}`;
  }
  return q.replace(/\s+/g, " ").trim();
}

export function amazonHostForMarket(
  market?: string | null,
): string {
  return AMAZON_HOST[normalizeVehicleMarket(market)];
}

/** Keyword search results URL (no product deep links). */
export function buildAmazonSearchUrl(
  searchQuery: string,
  market?: string | null,
): string {
  const host = amazonHostForMarket(market);
  const url = `https://${host}/s?k=${encodeURIComponent(searchQuery.trim())}`;
  return withAffiliateTag(url);
}

export function isAmazonUrl(url: string): boolean {
  try {
    return /amazon\./i.test(new URL(url).hostname);
  } catch {
    return /amazon\./i.test(url);
  }
}

/** True for /dp/ or /gp/product/ style deep links (avoid in current phase). */
export function isAmazonProductDeepLink(url: string): boolean {
  try {
    const path = new URL(url).pathname;
    return /\/(dp|gp\/product)\//i.test(path);
  } catch {
    return /amazon\.[^/\s]+\/(dp|gp\/product)\//i.test(url);
  }
}

/**
 * Normalize any Amazon URL (or empty) into a keyword search URL for this vehicle/part.
 */
export function toAmazonKeywordSearchUrl(options: {
  url?: string | null;
  vehicle?: VehicleFitment | null;
  partName: string;
  oemPartNumber?: string | null;
  searchQuery?: string | null;
}): { url: string; searchQuery: string } {
  const searchQuery =
    options.searchQuery?.trim() ||
    buildAmazonPartSearchQuery(
      options.vehicle,
      options.partName,
      options.oemPartNumber,
    );
  const market = options.vehicle?.market;
  // Always prefer keyword search over catalog /dp deep links
  if (!options.url || isAmazonUrl(options.url) || isAmazonProductDeepLink(options.url || "")) {
    return {
      url: buildAmazonSearchUrl(searchQuery, market),
      searchQuery,
    };
  }
  return { url: options.url, searchQuery };
}

/** DTC → common part keywords for search */
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
  vehicle: VehicleFitment;
  /** Ignored for Amazon in search-only phase (kept for API compatibility). */
  catalogUrls?: Partial<
    Record<"amazon" | "rockauto" | "autozone" | "oreilly", string | null>
  >;
  oemPartNumber?: string | null;
}): AffiliateLinkResult {
  const market = normalizeVehicleMarket(options.vehicle.market);
  const fitment = fitmentSearchString(options.vehicle as VehicleInfo);
  const searchQuery = buildAmazonPartSearchQuery(
    options.vehicle,
    options.part,
    options.oemPartNumber,
  );
  const amazonSearch = buildAmazonSearchUrl(searchQuery, market);

  const shop =
    market === "US" || market === "CA"
      ? "Amazon search / AutoZone / O'Reilly"
      : market === "GB" || market === "EU"
        ? "Amazon search / Local EU-UK"
        : "Amazon search / Local";

  const channels: AffiliateLinkResult["channels"] = [
    { store: "Amazon", url: amazonSearch, searchQuery },
  ];

  const q = `${fitment} ${options.part}`.trim();

  if (market === "US" || market === "CA") {
    channels.push({
      store: "AutoZone",
      url:
        options.catalogUrls?.autozone?.trim() ||
        `https://www.autozone.com/search?searchText=${encodeURIComponent(q)}`,
      searchQuery: q,
    });
    channels.push({
      store: "O'Reilly",
      url:
        options.catalogUrls?.oreilly?.trim() ||
        `https://www.oreillyauto.com/search?q=${encodeURIComponent(q)}`,
      searchQuery: q,
    });
  }

  return {
    partLabel: options.part,
    shop,
    primaryUrl: amazonSearch,
    searchQuery,
    channels,
  };
}
