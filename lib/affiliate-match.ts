/**
 * Affiliate parts matcher — prefer Admin catalog over AI-generated parts.
 */

import { createClient } from "@supabase/supabase-js";
import type { AffiliatePart } from "@/lib/types/affiliate-parts";
import type { VehicleInfo } from "@/lib/types/chat";
import type { PartsDataItem } from "@/lib/utils/parts";
import type { PartRecommendation, PurchaseChannel } from "@/lib/types/parts";
import type { RegionPurchasePart } from "@/lib/types/dashboard";
import { DISCLAIMER } from "@/lib/constants";
import {
  buildAmazonPartSearchQuery,
  buildAmazonSearchUrl,
  getAffiliateLinks,
} from "@/lib/affiliate-links";
import { buildPurchaseChannels } from "@/lib/purchase-links";

export type MatchedAffiliate = AffiliatePart & {
  matchScore: number;
};

export type AffiliateMatchOptions = {
  query?: string;
  category?: string | null;
  limit?: number;
  minScore?: number;
};

const REGION_CATEGORY: Record<string, string> = {
  brakes: "brake",
  engine: "engine",
  suspension: "suspension",
  battery: "electrical",
  tires: "consumable",
  hvac: "other",
  ac: "other",
  transmission: "engine",
  lights: "electrical",
};

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function yearMatchesRange(
  years: string | null | undefined,
  year: number,
): boolean {
  if (!years?.trim()) return true;
  const chunks = years.split(/[,;/|]+/).map((c) => c.trim()).filter(Boolean);
  if (chunks.length === 0) return true;

  for (const chunk of chunks) {
    const range = chunk.match(/^(\d{4})\s*[-–—]\s*(\d{4})$/);
    if (range) {
      const a = Number(range[1]);
      const b = Number(range[2]);
      if (year >= Math.min(a, b) && year <= Math.max(a, b)) return true;
      continue;
    }
    if (/^\d{4}$/.test(chunk) && Number(chunk) === year) return true;
  }
  return false;
}

function norm(s: string | null | undefined): string {
  return (s || "").trim().toLowerCase();
}

function makeModelFit(part: AffiliatePart, vehicle: VehicleInfo): number {
  const make = norm(vehicle.make);
  const model = norm(vehicle.model);
  const pMake = norm(part.vehicle_make);
  const pModel = norm(part.vehicle_model);

  let score = 0;
  if (!pMake && !pModel) {
    score += 1;
  } else {
    if (pMake && (make === pMake || make.includes(pMake) || pMake.includes(make))) {
      score += 4;
    } else if (pMake) {
      return -1;
    }
    if (pModel && (model === pModel || model.includes(pModel) || pModel.includes(model))) {
      score += 4;
    } else if (pModel) {
      return -1;
    }
  }

  if (!yearMatchesRange(part.vehicle_years, Number(vehicle.year))) {
    return -1;
  }
  if (part.vehicle_years?.trim()) score += 2;
  return score;
}

function queryScore(part: AffiliatePart, query: string): number {
  const q = norm(query);
  if (!q) return 0;
  const tokens = q
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !["the", "and", "for", "with", "this"].includes(t));

  const hay = [part.name, part.oem_number, part.brand, part.category, part.notes || ""]
    .join(" ")
    .toLowerCase();

  let score = 0;
  for (const t of tokens) {
    if (hay.includes(t)) score += 2;
  }
  if (q.includes(norm(part.oem_number)) && part.oem_number) score += 6;
  if (q.includes(norm(part.name)) && part.name.length > 4) score += 4;
  return score;
}

export function formatAffiliatePrice(part: AffiliatePart): string {
  const min = part.price_min;
  const max = part.price_max;
  if (min != null && max != null && min !== max) {
    return `$${Number(min).toFixed(2)}–$${Number(max).toFixed(2)}`;
  }
  if (min != null) return `$${Number(min).toFixed(2)}`;
  if (max != null) return `$${Number(max).toFixed(2)}`;
  return "—";
}

export function affiliatePriceNumber(part: AffiliatePart): number {
  if (part.price_min != null) return Number(part.price_min);
  if (part.price_max != null) return Number(part.price_max);
  return 0;
}

export function affiliateToChannels(
  part: AffiliatePart,
  vehicle?: VehicleInfo | null,
): PurchaseChannel[] {
  // Amazon: always keyword search (never catalog /dp deep links in this phase)
  const amazonQuery = vehicle
    ? buildAmazonPartSearchQuery(vehicle, part.name, part.oem_number)
    : [part.name, part.oem_number].filter(Boolean).join(" ").trim();
  const channels: PurchaseChannel[] = [
    {
      store: "Amazon",
      searchQuery: amazonQuery,
      searchUrl: buildAmazonSearchUrl(amazonQuery, vehicle?.market),
    },
  ];

  const push = (store: string, url: string | null | undefined) => {
    if (!url?.trim()) return;
    channels.push({
      store,
      searchQuery: amazonQuery,
      searchUrl: url.trim(),
    });
  };
  push("RockAuto", part.rockauto_url);
  push("AutoZone", part.autozone_url);
  push("O'Reilly", part.oreilly_url);

  // If no RockAuto etc. and we have a vehicle, fill US market shop searches
  if (vehicle && channels.length === 1) {
    const extras = getAffiliateLinks({
      part: part.name,
      vehicle,
      oemPartNumber: part.oem_number,
    }).channels.filter((c) => c.store !== "Amazon");
    for (const c of extras) {
      channels.push({
        store: c.store,
        searchQuery: c.searchQuery || amazonQuery,
        searchUrl: c.url,
      });
    }
  }

  for (const u of part.other_urls || []) {
    if (!u?.trim()) continue;
    // Skip Amazon deep links in other_urls — already have search
    if (/amazon\./i.test(u)) continue;
    let store = "Store";
    try {
      store = new URL(u).hostname.replace(/^www\./, "");
    } catch {
      /* keep */
    }
    channels.push({
      store,
      searchQuery: amazonQuery,
      searchUrl: u.trim(),
    });
  }
  return channels;
}

export function affiliateToPartsDataItem(
  part: AffiliatePart,
  vehicle?: VehicleInfo | null,
): PartsDataItem {
  const channels = vehicle
    ? buildPurchaseChannels(part.name, vehicle, part.oem_number)
    : affiliateToChannels(part, vehicle);
  // Prefer Amazon search URL first
  const amazon = channels.find((c) => c.store === "Amazon");
  const links = [
    ...(amazon ? [amazon.searchUrl] : []),
    ...channels
      .filter((c) => c.store !== "Amazon")
      .map((c) => c.searchUrl),
  ];
  return {
    oemNumber: part.oem_number,
    brand: part.brand || "OEM",
    name: part.name,
    category: part.category,
    quantity: 1,
    price: affiliatePriceNumber(part) || formatAffiliatePrice(part),
    purchaseLinks: links,
    source: "affiliate",
  };
}

export function affiliateToRecommendation(
  part: AffiliatePart,
  vehicle: VehicleInfo,
): PartRecommendation {
  return {
    name: part.name,
    category:
      part.category === "consumable" || part.category === "filter"
        ? "consumable"
        : "replacement",
    oemPartNumber: part.oem_number,
    aftermarketBrand: part.brand || "OEM",
    aftermarketPartNumber: "",
    fitment: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
    quantityNeeded: 1,
    unit: "each",
    estimatedPrice: formatAffiliatePrice(part),
    purchaseChannels: buildPurchaseChannels(
      part.name,
      vehicle,
      part.oem_number,
    ),
    notes: part.notes || "From Garage Genius affiliate catalog",
  };
}

export function affiliateToRegionPurchasePart(
  part: AffiliatePart,
  vehicle: VehicleInfo,
): RegionPurchasePart {
  const rec = affiliateToRecommendation(part, vehicle);
  return {
    name: rec.name,
    category: rec.category,
    oemPartNumber: rec.oemPartNumber,
    aftermarketBrand: rec.aftermarketBrand,
    aftermarketPartNumber: rec.aftermarketPartNumber,
    fitment: rec.fitment,
    quantityNeeded: rec.quantityNeeded,
    unit: rec.unit,
    estimatedPrice: rec.estimatedPrice,
    installDifficulty: "Medium",
    purchaseChannels: rec.purchaseChannels,
    notes: rec.notes,
  };
}

export function formatAffiliateMarkdownTable(
  parts: AffiliatePart[],
  vehicle?: VehicleInfo | null,
): string {
  if (parts.length === 0) return "";
  const lines = [
    "| Part | OEM # | Brand | Price | Search |",
    "| --- | --- | --- | --- | --- |",
  ];
  for (const p of parts) {
    const links = affiliateToChannels(p, vehicle)
      .map((c) =>
        c.store === "Amazon"
          ? `[Search on Amazon](${c.searchUrl})`
          : `[${c.store}](${c.searchUrl})`,
      )
      .join(" · ");
    lines.push(
      `| ${p.name} | ${p.oem_number || "—"} | ${p.brand || "—"} | ${formatAffiliatePrice(p)} | ${links || "—"} |`,
    );
  }
  return lines.join("\n");
}

export function formatAffiliateCatalogForPrompt(
  matches: MatchedAffiliate[],
  vehicle?: VehicleInfo | null,
): string | null {
  if (matches.length === 0) return null;
  const rows = matches.slice(0, 8).map((p, i) => {
    const amazonQ = vehicle
      ? buildAmazonPartSearchQuery(vehicle, p.name, p.oem_number)
      : `${p.name} ${p.oem_number}`.trim();
    const amazonUrl = buildAmazonSearchUrl(amazonQ, vehicle?.market);
    return `${i + 1}. ${p.name} | OEM ${p.oem_number} | Brand ${p.brand} | ${formatAffiliatePrice(p)} | category=${p.category} | Amazon search keywords: "${amazonQ}" | ${amazonUrl}`;
  });

  return `## Authoritative Affiliate Catalog (PRIORITY)
These parts are from the Garage Genius admin catalog for this vehicle. When recommending parts:
- Prefer these OEM numbers, brands, and prices EXACTLY.
- For Amazon, use KEYWORD SEARCH only (year + make + model + part name). Do NOT invent product /dp deep links or Associates tags.
- Put them in your markdown table AND in <parts-data> with purchaseLinks pointing to Amazon /s?k= search URLs.
- You may add 0–2 extra AI suggestions only if the catalog is incomplete for the user's issue.
- Remind the owner to compare sellers and verify fitment before buying.

${rows.join("\n")}`;
}

export async function matchAffiliateParts(
  vehicle: VehicleInfo,
  options: AffiliateMatchOptions = {},
): Promise<MatchedAffiliate[]> {
  const client = adminClient();
  if (!client) return [];

  const limit = options.limit ?? 8;
  const minScore = options.minScore ?? 0;

  let query = client
    .from("affiliate_parts")
    .select("*")
    .eq("is_active", true)
    .limit(120);

  if (options.category) {
    query = query.eq("category", options.category);
  }

  if (vehicle.make?.trim()) {
    query = query.or(
      `vehicle_make.is.null,vehicle_make.ilike.%${vehicle.make.trim()}%`,
    );
  }

  const { data, error } = await query;
  if (error || !data) {
    console.warn("[affiliate-match]", error?.message);
    return [];
  }

  const scored: MatchedAffiliate[] = [];
  for (const row of data as AffiliatePart[]) {
    const fit = makeModelFit(row, vehicle);
    if (fit < 0) continue;
    const qScore = queryScore(row, options.query || "");
    const catBonus =
      options.category && row.category === options.category ? 3 : 0;
    const matchScore = fit + qScore + catBonus;
    if (matchScore < minScore) continue;
    scored.push({ ...row, matchScore });
  }

  scored.sort((a, b) => b.matchScore - a.matchScore);
  return scored.slice(0, limit);
}

export function categoryForFocusRegion(regionId: string): string | null {
  return REGION_CATEGORY[regionId] ?? null;
}

export function applyAffiliatePartsToReply(
  content: string,
  matches: MatchedAffiliate[],
  vehicle?: VehicleInfo | null,
): string {
  if (matches.length === 0) return content;

  const catalog = matches.slice(0, 6);
  const items = catalog.map((p) => affiliateToPartsDataItem(p, vehicle));
  const table = formatAffiliateMarkdownTable(catalog, vehicle);
  const block = `<parts-data>\n${JSON.stringify(items, null, 2)}\n</parts-data>`;

  const existingMatch = content.match(
    /<parts-data>\s*([\s\S]*?)\s*<\/parts-data>/i,
  );

  let body = content;
  if (existingMatch) {
    try {
      const parsed = JSON.parse(existingMatch[1].trim()) as PartsDataItem[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        const merged: PartsDataItem[] = parsed.map((item) => {
          const oem = (item.oemNumber || "").trim().toLowerCase();
          const name = (item.name || "").trim().toLowerCase();
          const hit =
            catalog.find(
              (a) => a.oem_number.trim().toLowerCase() === oem && oem,
            ) ||
            catalog.find((a) => {
              const an = a.name.trim().toLowerCase();
              return name && (an.includes(name) || name.includes(an) || an === name);
            });
          if (hit) {
            return {
              ...affiliateToPartsDataItem(hit, vehicle),
              quantity: item.quantity ?? 1,
            };
          }
          // Rewrite any Amazon deep links on AI rows to keyword search
          if (vehicle) {
            const q = buildAmazonPartSearchQuery(
              vehicle,
              item.name,
              item.oemNumber,
            );
            const amazon = buildAmazonSearchUrl(q, vehicle.market);
            const other = (item.purchaseLinks || []).filter(
              (u) => !/amazon\./i.test(u),
            );
            return {
              ...item,
              purchaseLinks: [amazon, ...other],
              source: item.source ?? ("ai" as const),
            };
          }
          return { ...item, source: item.source ?? ("ai" as const) };
        });

        for (const a of catalog) {
          const oem = a.oem_number.trim().toLowerCase();
          if (
            !merged.some(
              (m) => (m.oemNumber || "").trim().toLowerCase() === oem && oem,
            ) &&
            a.matchScore >= 6
          ) {
            merged.push(affiliateToPartsDataItem(a, vehicle));
          }
        }

        return content.replace(
          existingMatch[0],
          `<parts-data>\n${JSON.stringify(merged, null, 2)}\n</parts-data>`,
        );
      }
    } catch {
      /* inject below */
    }
  }

  const inject = `\n\n### Recommended parts (catalog)\n${table}\n\n${block}\n`;
  if (body.includes(DISCLAIMER)) {
    return body.replace(DISCLAIMER, `${inject}\n${DISCLAIMER}`);
  }
  return `${body.trim()}${inject}\n\n${DISCLAIMER}`;
}
