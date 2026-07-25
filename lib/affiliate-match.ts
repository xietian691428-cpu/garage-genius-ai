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

export function affiliateToChannels(part: AffiliatePart): PurchaseChannel[] {
  const channels: PurchaseChannel[] = [];
  const push = (store: string, url: string | null | undefined) => {
    if (!url?.trim()) return;
    channels.push({
      store,
      searchQuery: part.oem_number || part.name,
      searchUrl: url.trim(),
    });
  };
  push("Amazon", part.amazon_url);
  push("RockAuto", part.rockauto_url);
  push("AutoZone", part.autozone_url);
  push("O'Reilly", part.oreilly_url);
  for (const u of part.other_urls || []) {
    if (!u?.trim()) continue;
    let store = "Store";
    try {
      store = new URL(u).hostname.replace(/^www\./, "");
    } catch {
      /* keep */
    }
    channels.push({
      store,
      searchQuery: part.oem_number || part.name,
      searchUrl: u.trim(),
    });
  }
  return channels;
}

export function affiliateToPartsDataItem(part: AffiliatePart): PartsDataItem {
  return {
    oemNumber: part.oem_number,
    brand: part.brand || "OEM",
    name: part.name,
    category: part.category,
    quantity: 1,
    price: affiliatePriceNumber(part) || formatAffiliatePrice(part),
    purchaseLinks: affiliateToChannels(part).map((c) => c.searchUrl),
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
    purchaseChannels: affiliateToChannels(part),
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

export function formatAffiliateMarkdownTable(parts: AffiliatePart[]): string {
  if (parts.length === 0) return "";
  const lines = [
    "| Part | OEM # | Brand | Price | Links |",
    "| --- | --- | --- | --- | --- |",
  ];
  for (const p of parts) {
    const links = affiliateToChannels(p)
      .map((c) => `[${c.store}](${c.searchUrl})`)
      .join(" · ");
    lines.push(
      `| ${p.name} | ${p.oem_number || "—"} | ${p.brand || "—"} | ${formatAffiliatePrice(p)} | ${links || "—"} |`,
    );
  }
  return lines.join("\n");
}

export function formatAffiliateCatalogForPrompt(
  matches: MatchedAffiliate[],
): string | null {
  if (matches.length === 0) return null;
  const rows = matches.slice(0, 8).map((p, i) => {
    const links = affiliateToChannels(p)
      .map((c) => `${c.store}: ${c.searchUrl}`)
      .join(" | ");
    return `${i + 1}. ${p.name} | OEM ${p.oem_number} | Brand ${p.brand} | ${formatAffiliatePrice(p)} | category=${p.category} | ${links || "no links"}`;
  });

  return `## Authoritative Affiliate Catalog (PRIORITY)
These parts are from the Garage Genius admin catalog for this vehicle. When recommending parts:
- Prefer these OEM numbers, brands, prices, and buy links EXACTLY.
- Put them in your markdown table AND in <parts-data> (same values).
- Do not invent alternate OEM numbers for the same part name.
- You may add 0–2 extra AI suggestions only if the catalog is incomplete for the user's issue.

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
): string {
  if (matches.length === 0) return content;

  const catalog = matches.slice(0, 6);
  const items = catalog.map(affiliateToPartsDataItem);
  const table = formatAffiliateMarkdownTable(catalog);
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
              ...affiliateToPartsDataItem(hit),
              quantity: item.quantity ?? 1,
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
            merged.push(affiliateToPartsDataItem(a));
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
