import type { PutcoFitmentResult, PutcoProductBrief } from "@/lib/putco/types";

export const PUTCO_SOURCE_LINE =
  "Source: Putco fitment API (brand catalog). Not OEM factory parts data. Verify on vehicle and seller listing.";

const MAX_PRODUCTS = 8;

function lineForProduct(p: PutcoProductBrief, i: number): string {
  const bits = [`${i}. ${p.title}`];
  if (p.sku && p.sku !== "unknown") bits.push(`SKU ${p.sku}`);
  if (p.price) bits.push(p.price);
  if (p.category) bits.push(`(${p.category})`);
  const head = bits.join(" · ");
  if (p.url) return `${head}\n   ${p.url}`;
  return head;
}

/**
 * Format a Chat system inject block. Never invents bulb sizes.
 * Empty / failed → short degrade line (caller may omit entirely).
 */
export function formatPutcoFitmentBlock(
  result: PutcoFitmentResult,
  options?: { structureUnconfirmed?: boolean },
): string | null {
  if (!result.ok) {
    if (result.reason === "eu_uk_catalog" || result.usCatalogOnlyNote) {
      return `[PUTCO_FITMENT]
status: skipped_us_catalog_only
Putco's public AI catalog is US/CA oriented (country=us|ca). Do not claim ECE/UK type approval, EU road legality, or that a Putco US listing equals local certified lighting for this market.
If the owner still wants brand ideas, say the catalog is US/CA and they must verify local regulations and seller fitment.
${PUTCO_SOURCE_LINE}`;
    }
    if (
      result.reason === "timeout" ||
      result.reason === "http" ||
      result.reason === "parse"
    ) {
      return `[PUTCO_FITMENT]
status: unavailable
Putco fitment could not be queried this turn (${result.reason}${result.detail ? `: ${result.detail}` : ""}). Do not invent a Putco product list. Continue with [LIGHTING_PATH] / housing confirm and generic education only.
${PUTCO_SOURCE_LINE}`;
    }
    if (result.reason === "empty") {
      return `[PUTCO_FITMENT]
status: empty
No Putco YMM matches returned for this year/make/model in the brand catalog. Do not invent SKUs. Say none listed for this YMM in Putco's catalog and keep structure/OEM rules intact.
${PUTCO_SOURCE_LINE}`;
    }
    return null;
  }

  const products = result.products.slice(0, MAX_PRODUCTS);
  const structureNote = options?.structureUnconfirmed
    ? "Structure still unconfirmed (ambiguous). Do NOT use this list to name H11/9005/etc. or say the low beam must be a specific bulb. Confirm dust-cap vs sealed first; then you may mention Putco accessories as optional brand catalog ideas for this YMM."
    : "You may cite these as Putco brand-catalog accessories for this YMM only — not as OEM-required parts. Still verify on the vehicle and seller listing.";

  const lines = products.map((p, i) => lineForProduct(p, i + 1));

  return `[PUTCO_FITMENT]
status: ok
query: ${result.year} ${result.make} ${result.model} (country=${result.country}${result.fromCache ? ", cache" : ""})
${structureNote}
Products (max ${MAX_PRODUCTS}, brand catalog):
${lines.join("\n")}
${PUTCO_SOURCE_LINE}`;
}
