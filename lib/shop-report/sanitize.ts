/**
 * Education-tone guards for Shop Report LLM output.
 * Softens imperative repair language before PDF / archive.
 */

import type { ShopReportFactor } from "@/lib/types/shop-report";

export function sanitizeShopReportFactors(
  raw:
    | Array<{
        title?: string;
        explanation?: string;
        howToVerify?: string;
      }>
    | null
    | undefined,
): ShopReportFactor[] {
  const out: ShopReportFactor[] = [];
  for (const f of raw || []) {
    const title = (f?.title || "").trim();
    const explanation = (f?.explanation || "").trim();
    const howToVerify = (f?.howToVerify || "").trim();
    if (!title || !explanation) continue;
    const safeExpl = /replace\b|root cause is\b|you must\b/i.test(explanation)
      ? `Common causes reported for this combination include considerations around ${title.toLowerCase()}. These are for professional verification only.`
      : explanation;
    out.push({
      title,
      explanation: safeExpl,
      howToVerify:
        howToVerify ||
        "Verify with standard shop procedures and OEM guidance.",
    });
    if (out.length >= 5) break;
  }
  return out;
}

export function sanitizeShopReportSteps(steps: string[]): string[] {
  return steps
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      if (/^replace\b/i.test(s)) {
        return `Inspect / verify condition related to: ${s.replace(/^replace\b/i, "").trim()}`;
      }
      return s;
    })
    .slice(0, 8);
}
