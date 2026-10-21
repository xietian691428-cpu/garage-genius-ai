/**
 * Stop rules — force “see a pro / no deep DIY” via [STOP_RULE] system block.
 * Complements safety-topics + drive-safety; does not duplicate callout UI.
 */

import stopRulesJson from "@/content/safety/stop-rules.json";

export type StopRule = {
  id: string;
  patterns: string[];
  summary_en: string;
  owner_prep_en: string;
};

function parseRules(raw: unknown): StopRule[] {
  if (!Array.isArray(raw)) return [];
  const out: StopRule[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const id = String(r.id || "").trim();
    const summary = String(r.summary_en || "").trim();
    const prep = String(r.owner_prep_en || "").trim();
    const patterns = Array.isArray(r.patterns)
      ? r.patterns.map((p) => String(p || "").trim().toLowerCase()).filter(Boolean)
      : [];
    if (!id || !summary || !patterns.length) continue;
    out.push({ id, patterns, summary_en: summary, owner_prep_en: prep });
  }
  return out;
}

const RULES = parseRules(stopRulesJson);

export function listStopRules(): StopRule[] {
  return RULES;
}

export function matchStopRules(text: string): StopRule[] {
  const lower = (text || "").toLowerCase();
  if (!lower.trim()) return [];
  return RULES.filter((rule) =>
    rule.patterns.some((p) => lower.includes(p)),
  );
}

/**
 * [STOP_RULE] block — when present, model must not continue deep DIY.
 */
export function formatStopRuleBlock(text: string): string | null {
  const hits = matchStopRules(text);
  if (!hits.length) return null;
  const lines = hits.slice(0, 3).map(
    (h) =>
      `- ${h.id}: ${h.summary_en} Owner can still record: ${h.owner_prep_en}`,
  );
  return [
    "[STOP_RULE]",
    "HIT — do not continue deep DIY steps, coding procedures, or hydraulic/HV teardown.",
    "Required: tell the owner to arrange a qualified technician; you may keep brief pre-shop info to record.",
    "Do not invent OEM coding menus, torque specs, or “safe DIY” workarounds for these topics.",
    lines.join("\n"),
  ].join("\n");
}

export function hasStopRuleHit(text: string): boolean {
  return matchStopRules(text).length > 0;
}
