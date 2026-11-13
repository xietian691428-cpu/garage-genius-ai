/**
 * Light diagnostic query rewrite + candidate re-rank.
 * Rule-only — no embeddings, GraphRAG, or agent loops.
 * Rewrites feed path / retrieval matching; they do not draft answers.
 */

import type { DiyCheckPath, DiyCheckPathId } from "@/lib/diy-check-paths";
import type { ManualIntent } from "@/lib/vehicle-manual-intent";

export type DiagnosticRewriteFamily =
  | "soft_brake"
  | "overheat"
  | "misfire"
  | "hard_start"
  | "fluids_oil"
  | "fluids_coolant"
  | "fluids_brake"
  | "fluids_atf"
  | "dtc";

export type DiagnosticRewriteResult = {
  original: string;
  /** Original + appended canonical tokens (for matching / retrieval). */
  matchText: string;
  /** Families that fired (ordered by safety weight). */
  families: DiagnosticRewriteFamily[];
  /** True when at least one rewrite rule appended tokens. */
  rewritten: boolean;
};

type RewriteRule = {
  family: DiagnosticRewriteFamily;
  /** Safety-first weight (higher wins when ranking DIY paths). */
  weight: number;
  re: RegExp;
  /** Canonical English tokens that hit existing DIY / intent matchers. */
  append: string;
};

/**
 * Colloquial / fuzzy symptom → canonical tokens.
 * Keep append strings aligned with diy-check-paths + vehicle-manual-intent regexes.
 */
const REWRITE_RULES: readonly RewriteRule[] = [
  // —— Safety-critical first ——
  {
    family: "soft_brake",
    weight: 100,
    re: /\b(mushy|squishy|brake[s]?\s+feel\s+(?:soft|mushy|spongy)|soft\s+brakes?|spongy\s+brakes?|pedal\s+goes\s+down|no\s+brakes?)\b|刹车软|脚感软|刹车发软|踩刹车.*软/i,
    append:
      "soft brake pedal spongy pedal brake warning light do not drive",
  },
  {
    family: "overheat",
    weight: 95,
    re: /\b((?:gets?|getting)\s+too\s+hot|temp(?:erature)?\s+(?:climb|rising|going\s+up)|ac\s+on.{0,40}(?:hot|heat)|(?:hot|heat).{0,40}ac\s+on|a\/?c\s+on.{0,40}(?:hot|overheat)|needle\s+(?:in\s+the\s+)?red|cooking\s+(?:the\s+)?engine)\b|过热|开了空调.*(?:热|烫)|空调一开.*(?:热|烫)|水温高|冒白烟/i,
    append:
      "overheating running hot temp gauge steam from the hood coolant",
  },
  {
    family: "misfire",
    weight: 90,
    re: /\b((?:car|engine|it)\s+(?:is\s+)?(?:shak(?:e|ing)|vibrat(?:e|ing)|trembl(?:e|ing))|shak(?:e|ing)\s+(?:a\s+lot|hard|badly)|rough\s+(?:idle|running)|missing\s+(?:on\s+)?(?:cylinders?|idle)|engine\s+miss(?:es|ing)?)\b|发抖|抖得厉害|发动机抖|车抖|怠速抖/i,
    append:
      "engine shaking hard misfire random misfire flashing check engine",
  },
  {
    family: "hard_start",
    weight: 85,
    re: /\b(won'?t\s+turn\s+over|will\s+not\s+turn\s+over|just\s+clicks?|only\s+clicks?|click(?:s|ing)?\s+(?:but\s+)?no\s+start|try(?:ing)?\s+to\s+start.{0,20}click|dead\s+battery\s+click|no\s+turnover)\b|打不着|打不燃|一点火就咔|启动困难|打火只有咔哒/i,
    append: "won't start no crank click only hard start",
  },
  // —— Fluids / specs ——
  {
    family: "fluids_oil",
    weight: 50,
    re: /\b(what\s+(?:kind|type|grade)\s+of\s+oil|which\s+oil\s+(?:should|do)|oil\s+(?:does\s+it\s+take|for\s+this)|how\s+much\s+oil)\b|加什么机油|机油.*(多少|粘度|型号)|换机油/i,
    append: "engine oil viscosity capacity oil change quarts",
  },
  {
    family: "fluids_coolant",
    weight: 48,
    re: /\b(what\s+(?:kind|type)\s+of\s+coolant|which\s+coolant|coolant\s+(?:does\s+it\s+take|type)|antifreeze\s+type)\b|加什么冷却液|防冻液.*(什么|型号|多少)/i,
    append: "coolant antifreeze capacity mixture reservoir",
  },
  {
    family: "fluids_brake",
    weight: 48,
    re: /\b(what\s+(?:kind|type)\s+of\s+brake\s+fluid|which\s+brake\s+fluid|brake\s+fluid\s+(?:type|dot|does))\b|制动液|刹车油.*(什么|DOT)/i,
    append: "brake fluid DOT reservoir",
  },
  {
    family: "fluids_atf",
    weight: 48,
    re: /\b(what\s+(?:kind|type)\s+of\s+(?:transmission|atf|cvt)\s+fluid|which\s+(?:atf|cvt|transmission\s+fluid)|transmission\s+fluid\s+(?:type|can\s+i)|can\s+i\s+(?:use|put)\s+(?:dexron|mercon|any\s+atf))\b|变速箱油|CVT油|波箱油/i,
    append: "ATF automatic transmission fluid CVT fluid transmission fluid type",
  },
  {
    family: "dtc",
    weight: 40,
    re: /\b(check\s+engine|cel\s+on|mil\s+on|engine\s+light|code\s+reader|scanned?\s+a\s+code)\b|故障灯|发动机灯/i,
    append: "check engine diagnosis trouble code malfunction indicator",
  },
];

const FAMILY_TO_DIY: Partial<Record<DiagnosticRewriteFamily, DiyCheckPathId>> =
  {
    soft_brake: "soft_brake",
    overheat: "overheat_steam",
    misfire: "misfire_random",
    hard_start: "hard_start",
    fluids_oil: "oil_change",
    fluids_coolant: "coolant_topup",
  };

const FAMILY_TO_INTENT: Partial<Record<DiagnosticRewriteFamily, ManualIntent>> =
  {
    soft_brake: "brake_warning",
    overheat: "overheat",
    misfire: "dtc_related",
    hard_start: "general",
    fluids_oil: "fluids_oil",
    fluids_coolant: "fluids_coolant",
    fluids_brake: "fluids_brake",
    fluids_atf: "fluids_atf",
    dtc: "dtc_related",
  };

const DIY_SAFETY_SCORE: Partial<Record<DiyCheckPathId, number>> = {
  soft_brake: 100,
  overheat_steam: 95,
  misfire_random: 90,
  hard_start: 85,
  brake_pads: 40,
  coolant_topup: 35,
  spark_plugs: 30,
  battery_12v: 30,
  oil_change: 25,
  tpms: 20,
  seasonal_wipers_battery: 15,
};

/**
 * Normalize fuzzy / colloquial diagnostic asks into matchable tokens.
 * On failure or no-hit: matchText === original (graceful no-op).
 */
export function rewriteDiagnosticQuery(
  userText: string,
): DiagnosticRewriteResult {
  const original = userText ?? "";
  if (!original.trim()) {
    return { original, matchText: original, families: [], rewritten: false };
  }

  const hits: RewriteRule[] = [];
  for (const rule of REWRITE_RULES) {
    try {
      if (rule.re.test(original)) hits.push(rule);
    } catch {
      // ignore bad rule — never break the turn
    }
  }

  if (!hits.length) {
    return { original, matchText: original, families: [], rewritten: false };
  }

  hits.sort((a, b) => b.weight - a.weight);
  const families = [...new Set(hits.map((h) => h.family))];
  const append = hits
    .map((h) => h.append)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  const matchText = `${original}\n${append}`.slice(0, 1200);

  return { original, matchText, families, rewritten: true };
}

/** Preferred ManualIntent from rewrite families (safety-first). */
export function intentHintFromRewrite(
  result: DiagnosticRewriteResult,
): ManualIntent | null {
  for (const f of result.families) {
    const intent = FAMILY_TO_INTENT[f];
    if (intent) return intent;
  }
  return null;
}

/** Preferred DIY path id from rewrite families. */
export function diyPathHintFromRewrite(
  result: DiagnosticRewriteResult,
): DiyCheckPathId | null {
  for (const f of result.families) {
    const id = FAMILY_TO_DIY[f];
    if (id) return id;
  }
  return null;
}

/**
 * Score DIY path candidates. Higher = prefer.
 * Safety stop paths beat routine pad/coolant/plug jobs.
 */
export function scoreDiyPathCandidate(
  path: Pick<DiyCheckPath, "id" | "safetyTopicIds">,
  rewrite: DiagnosticRewriteResult,
): number {
  let score = DIY_SAFETY_SCORE[path.id] ?? 10;
  if (path.safetyTopicIds.includes("unsafe_to_drive")) score += 20;
  if (path.safetyTopicIds.includes("cooling_hot")) score += 10;
  if (path.safetyTopicIds.includes("brakes")) score += 10;
  const hint = diyPathHintFromRewrite(rewrite);
  if (hint && path.id === hint) score += 40;
  if (
    rewrite.families.includes("soft_brake") &&
    path.id === "soft_brake"
  ) {
    score += 15;
  }
  if (
    rewrite.families.includes("overheat") &&
    path.id === "overheat_steam"
  ) {
    score += 15;
  }
  if (
    rewrite.families.includes("misfire") &&
    path.id === "misfire_random"
  ) {
    score += 15;
  }
  return score;
}

/**
 * Light re-rank among DIY path candidates that already matched.
 * Empty input → null. Single candidate → that path (no-op).
 */
export function rerankDiyCheckPaths(
  candidates: readonly DiyCheckPath[],
  rewrite: DiagnosticRewriteResult,
): DiyCheckPath | null {
  if (!candidates.length) return null;
  if (candidates.length === 1) return candidates[0] ?? null;
  const scored = candidates.map((p, index) => ({
    path: p,
    index,
    score: scoreDiyPathCandidate(p, rewrite),
  }));
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored[0]?.path ?? null;
}

export type ManualHitForRerank = {
  heading: string | null;
  content?: string;
  rank: number;
};

/**
 * Intent-aware boost on top of FTS rank.
 * Priority: safety stop cues > fluid/spec headings > DTC/misfire > general.
 */
export function intentManualHitBoost(
  hit: ManualHitForRerank,
  intent: ManualIntent | null | undefined,
): number {
  const blob = `${hit.heading || ""}\n${hit.content || ""}`.toLowerCase();
  let boost = 0;

  // Spec / capacity headings (garage-aligned retrieval)
  if (
    /\b(specifications?|capacit(?:y|ies)|fluids?|lubricants?|engine oil|coolant|antifreeze|brake fluid|atf|transmission|cvt)\b/i.test(
      hit.heading || "",
    )
  ) {
    boost += 2;
  }

  if (intent === "overheat" || intent === "fluids_coolant") {
    if (/\b(coolant|antifreeze|radiator|overheat|reservoir|steam)\b/i.test(blob)) {
      boost += 3;
    }
    if (/\b(do not open|when hot|pressurized)\b/i.test(blob)) boost += 4;
  }
  if (intent === "brake_warning" || intent === "fluids_brake") {
    if (/\b(brake fluid|dot[\s-]?[345]|soft pedal|warning)\b/i.test(blob)) {
      boost += 3;
    }
    if (/\b(bleed|hydraulic)\b/i.test(blob)) boost += 1;
  }
  if (intent === "fluids_oil") {
    if (/\b(engine oil|viscosity|0w-|5w-|with filter|quart)\b/i.test(blob)) {
      boost += 3;
    }
  }
  if (intent === "fluids_atf") {
    if (/\b(cvt|atf|transmission fluid|mercon|dexron)\b/i.test(blob)) {
      boost += 3;
    }
    if (/\bcvt\b/i.test(blob)) boost += 2;
  }
  if (intent === "dtc_related") {
    if (/\b(misfire|spark|ignition|check engine|malfunction)\b/i.test(blob)) {
      boost += 2;
    }
  }

  return boost;
}

/**
 * Simple re-rank for manual chunks. Falls back to input order on empty/errors.
 */
export function rerankManualHitsForIntent<T extends ManualHitForRerank>(
  hits: T[],
  opts: { intent?: ManualIntent | null; limit?: number } = {},
): T[] {
  if (!hits?.length) return [];
  const limit = Math.max(1, Math.min(opts.limit ?? 4, 5));
  try {
    return [...hits]
      .map((h) => ({
        ...h,
        rank: Number(h.rank) + intentManualHitBoost(h, opts.intent),
      }))
      .sort((a, b) => b.rank - a.rank)
      .slice(0, limit);
  } catch {
    return hits.slice(0, limit);
  }
}
