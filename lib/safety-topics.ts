/**
 * High-risk DIY safety topics — single source of truth for Chat callouts.
 *
 * Maintenance:
 * - Local defaults live in DEFAULT_SAFETY_TOPICS (git / release). Add a new
 *   topic by appending an id + keywords + short educational callout.
 * - Remote overrides (optional): see lib/safety-topics-remote.ts — Admin-reviewed
 *   rows only; never auto-import NHTSA/recall API text into callouts.
 * - Recall / regulatory APIs may power separate “vehicle has a recall” UX;
 *   they must NOT rewrite these callout strings without human review + enable.
 *
 * Users may dismiss the general Chat disclaimer banner; they cannot disable
 * high-risk callouts for matched turns.
 */

import { detectReplyLanguageHint, type ReplyLanguageHint } from "@/lib/reply-language";

export type SafetySeverity = "high" | "critical";

export type SafetyTopic = {
  /** Stable id, e.g. "brakes" */
  id: string;
  severity: SafetySeverity;
  /** English keywords / phrases (case-insensitive). */
  keywords: string[];
  keywordsZh?: string[];
  keywordsEs?: string[];
  calloutEn: string;
  calloutZh?: string;
  calloutEs?: string;
  /** When false, topic is ignored (remote kill-switch). Default true. */
  enabled?: boolean;
};

const SEVERITY_RANK: Record<SafetySeverity, number> = {
  critical: 2,
  high: 1,
};

/** Max callouts per AI reply — avoid stacking. */
export const SAFETY_CALLOUT_MAX = 2;

/**
 * Built-in catalog (P0). Prefer over-prompting on true DIY hazards.
 * Keep callouts short and educational — no legal scare stacking.
 */
export const DEFAULT_SAFETY_TOPICS: readonly SafetyTopic[] = [
  {
    id: "brakes",
    severity: "high",
    keywords: [
      "brake",
      "brakes",
      "brake pad",
      "brake pads",
      "brake rotor",
      "brake rotors",
      "brake fluid",
      "abs",
      "abs module",
      "caliper",
      "calipers",
    ],
    keywordsZh: [
      "刹车",
      "制动",
      "刹车片",
      "刹车盘",
      "刹车油",
      "手刹",
      "制动液",
    ],
    calloutEn:
      "Safety: Brake work affects stopping power. If you're not trained or lack proper tools, use a qualified shop.",
    calloutZh:
      "安全提示：制动相关作业影响停车能力。若未受训或缺少合适工具，请交给合格技师处理。",
  },
  {
    id: "airbag_srs",
    severity: "critical",
    keywords: [
      "airbag",
      "air bag",
      "airbags",
      "srs",
      "supplemental restraint",
      "clock spring",
      "crash sensor",
    ],
    keywordsZh: ["安全气囊", "气囊", "SRS"],
    calloutEn:
      "Safety: Airbag/SRS systems can deploy unexpectedly. Disconnecting batteries or probing SRS circuits can cause serious injury—prefer a professional.",
    calloutZh:
      "安全提示：安全气囊/SRS 可能意外弹出。断开蓄电池或探测 SRS 电路可能造成严重伤害——建议由专业人员处理。",
  },
  {
    id: "fuel_system",
    severity: "high",
    keywords: [
      "fuel line",
      "fuel rail",
      "fuel pump",
      "fuel system",
      "gasoline",
      "petrol",
      "diesel leak",
      "fuel filter under pressure",
    ],
    keywordsZh: ["燃油", "汽油", "柴油", "油管", "燃油泵"],
    calloutEn:
      "Safety: Fuel system work involves fire risk. No sparks or open flame; relieve pressure only as the service procedure allows.",
    calloutZh:
      "安全提示：燃油系统作业有火灾风险。严禁火花与明火；仅按维修规程泄压。",
  },
  {
    id: "high_voltage_ev",
    severity: "critical",
    keywords: [
      "high voltage",
      "hv battery",
      "orange cable",
      "orange cables",
      "traction battery",
      "service plug",
      "ev battery",
      "hybrid battery pack",
      "high-voltage",
    ],
    keywordsZh: ["高压", "动力电池", "橙色线", "维修开关", "混动电池"],
    calloutEn:
      "Safety: High-voltage hybrid/EV systems can cause severe injury or death. Do not cut orange cables or open HV packs unless trained and qualified.",
    calloutZh:
      "安全提示：混动/电动车高压系统可导致严重伤害或死亡。未受训合格前，勿切割橙色高压线缆或打开高压电池包。",
  },
  {
    id: "lifting_under_car",
    severity: "high",
    keywords: [
      "jack",
      "jack stands",
      "axle stands",
      "lift the car",
      "lift the vehicle",
      "under the vehicle",
      "under the car",
      "crawl under",
      "floor jack",
      "floor jack only",
    ],
    keywordsZh: ["千斤顶", "顶车", "车底下", "举升"],
    calloutEn:
      "Safety: Never rely on a jack alone. Use rated jack stands on solid ground before working under a vehicle.",
    calloutZh:
      "安全提示：切勿仅依赖千斤顶支撑。在车下作业前，请在坚实地面使用额定千斤顶支架。",
  },
  {
    id: "wheel_road",
    severity: "high",
    keywords: [
      "change tire on the road",
      "roadside wheel",
      "lug nuts on highway",
      "wheel falls off",
      "roadside tire",
    ],
    keywordsZh: ["路边换胎", "高速公路换胎"],
    calloutEn:
      "Safety: Roadside wheel work is hazardous. Use hazards, safe distance from traffic, and proper lug torque when possible.",
    calloutZh:
      "安全提示：路边换胎风险高。请开启双闪、远离车流，并在条件允许时按规定力矩紧固螺母。",
  },
  {
    id: "cooling_hot",
    severity: "high",
    keywords: [
      "radiator cap hot",
      "open radiator when hot",
      "cooling system pressure",
      "scalding coolant",
      "hot radiator",
    ],
    keywordsZh: ["开水箱盖", "热车开水壶", "冷却液喷"],
    calloutEn:
      "Safety: Hot coolant is under pressure and can cause severe burns. Only open cooling systems when cool.",
    calloutZh:
      "安全提示：热冷却液带压，可能导致严重烫伤。请待系统冷却后再打开。",
  },
  {
    id: "exhaust_co",
    severity: "critical",
    keywords: [
      "carbon monoxide",
      "run engine in garage",
      "closed garage exhaust",
      "engine in a closed garage",
    ],
    keywordsZh: ["一氧化碳", "密闭车库收车"],
    calloutEn:
      "Safety: Never run the engine in a closed garage—carbon monoxide is deadly.",
    calloutZh: "安全提示：切勿在密闭车库内怠速运转发动机——一氧化碳可致命。",
  },
] as const;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Latin / digit keyword: phrase match with loose word edges (avoids "abs" in "absolute"). */
function latinKeywordMatches(haystackLower: string, keyword: string): boolean {
  const kw = keyword.trim().toLowerCase();
  if (!kw) return false;
  const escaped = escapeRegex(kw).replace(/\s+/g, "\\s+");
  // Non-letter/digit edges so "abs" ≠ "absolute", but "brake pads" still matches.
  const re = new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, "i");
  return re.test(haystackLower);
}

function cjkKeywordMatches(haystack: string, keyword: string): boolean {
  const kw = keyword.trim();
  if (!kw) return false;
  return haystack.includes(kw);
}

export function topicMatchesText(topic: SafetyTopic, text: string): boolean {
  if (topic.enabled === false) return false;
  const raw = text || "";
  if (!raw.trim()) return false;
  const lower = raw.toLowerCase();

  for (const kw of topic.keywords) {
    if (latinKeywordMatches(lower, kw)) return true;
  }
  for (const kw of topic.keywordsZh ?? []) {
    if (cjkKeywordMatches(raw, kw)) return true;
  }
  for (const kw of topic.keywordsEs ?? []) {
    if (latinKeywordMatches(lower, kw)) return true;
  }
  return false;
}

/**
 * Merge remote overrides onto local defaults by id.
 * Remote can add keywords, replace callouts, change severity, or disable.
 * Unknown remote ids are appended (still require enabled !== false).
 */
export function mergeSafetyTopics(
  local: readonly SafetyTopic[],
  remote: readonly SafetyTopic[] | null | undefined,
): SafetyTopic[] {
  if (!remote?.length) return local.map((t) => ({ ...t }));

  const byId = new Map<string, SafetyTopic>();
  for (const t of local) byId.set(t.id, { ...t });

  for (const r of remote) {
    if (!r?.id) continue;
    const base = byId.get(r.id);
    if (!base) {
      byId.set(r.id, { ...r, enabled: r.enabled !== false });
      continue;
    }
    byId.set(r.id, {
      ...base,
      ...r,
      keywords: r.keywords?.length ? r.keywords : base.keywords,
      keywordsZh: r.keywordsZh ?? base.keywordsZh,
      keywordsEs: r.keywordsEs ?? base.keywordsEs,
      calloutEn: r.calloutEn || base.calloutEn,
      calloutZh: r.calloutZh ?? base.calloutZh,
      calloutEs: r.calloutEs ?? base.calloutEs,
      enabled: r.enabled !== false && base.enabled !== false,
    });
  }

  return [...byId.values()];
}

export function resolveSafetyCallout(
  topic: SafetyTopic,
  lang: ReplyLanguageHint,
): string {
  if (lang === "zh" && topic.calloutZh?.trim()) return topic.calloutZh;
  if (lang === "es" && topic.calloutEs?.trim()) return topic.calloutEs;
  return topic.calloutEn;
}

export type SafetyMatchOptions = {
  topics?: readonly SafetyTopic[];
  /** Max callouts to return (default SAFETY_CALLOUT_MAX). */
  max?: number;
  /**
   * Language for callout text. Prefer user's latest message (HARD LANGUAGE LOCK).
   * If omitted, inferred from the joined text.
   */
  lang?: ReplyLanguageHint;
  /**
   * When set, assistant-only soft matches (e.g. “Brake inspection” in a
   * prevention list) are suppressed unless the user also triggered the topic,
   * the hit is critical, or the assistant match used a strong phrase.
   */
  userText?: string | null;
  assistantText?: string | null;
};

export type SafetyTopicHit = {
  topic: SafetyTopic;
  callout: string;
};

/** Longest matched keyword for a topic, or null (prefer phrases over bare tokens). */
export function firstMatchingKeyword(
  topic: SafetyTopic,
  text: string,
): string | null {
  if (topic.enabled === false) return null;
  const raw = text || "";
  if (!raw.trim()) return null;
  const lower = raw.toLowerCase();
  const hits: string[] = [];
  for (const kw of topic.keywords) {
    if (latinKeywordMatches(lower, kw)) hits.push(kw);
  }
  for (const kw of topic.keywordsZh ?? []) {
    if (cjkKeywordMatches(raw, kw)) hits.push(kw);
  }
  for (const kw of topic.keywordsEs ?? []) {
    if (latinKeywordMatches(lower, kw)) hits.push(kw);
  }
  if (!hits.length) return null;
  hits.sort((a, b) => b.trim().length - a.trim().length);
  return hits[0] ?? null;
}

/**
 * Strong assistant-only match: multi-word phrase, CJK, or long token.
 * Avoids “Brake inspection” / bare “brake” false positives on oil-change tips.
 */
function isStrongKeyword(kw: string): boolean {
  const t = kw.trim();
  if (!t) return false;
  if (/[\u3400-\u9fff]/.test(t)) return true;
  if (/\s/.test(t)) return true;
  return t.length >= 8;
}

/**
 * Match user + optional assistant text → up to N topics (critical first).
 * Prefer `userText` / `assistantText` in options for turn-aware filtering.
 */
export function matchSafetyTopics(
  text: string,
  options: SafetyMatchOptions = {},
): SafetyTopicHit[] {
  const catalog = options.topics ?? DEFAULT_SAFETY_TOPICS;
  const max = options.max ?? SAFETY_CALLOUT_MAX;

  const userText = options.userText;
  const assistantText = options.assistantText;
  const useSplit =
    userText !== undefined || assistantText !== undefined;

  const blob = useSplit
    ? [userText, assistantText].filter(Boolean).join("\n")
    : text || "";
  if (!blob.trim() && !useSplit) return [];

  const lang =
    options.lang ??
    detectReplyLanguageHint(
      (userText && String(userText).trim()) || blob,
    );

  let hits: SafetyTopic[];

  if (useSplit) {
    const userBlob = userText || "";
    const asstBlob = assistantText || "";
    const userIds = new Set(
      catalog
        .filter((t) => topicMatchesText(t, userBlob))
        .map((t) => t.id),
    );
    hits = catalog.filter((t) => {
      if (topicMatchesText(t, userBlob)) return true;
      if (!asstBlob.trim()) return false;
      const kw = firstMatchingKeyword(t, asstBlob);
      if (!kw) return false;
      // Critical always; otherwise need strong phrase or user already on topic.
      if (t.severity === "critical") return true;
      if (userIds.has(t.id)) return true;
      return isStrongKeyword(kw);
    });
  } else {
    hits = catalog.filter((t) => topicMatchesText(t, blob));
  }

  hits.sort(
    (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity],
  );

  return hits.slice(0, Math.max(0, max)).map((topic) => ({
    topic,
    callout: resolveSafetyCallout(topic, lang),
  }));
}

/** Convenience: any high-risk hit? */
export function textNeedsHighRiskSafetyCallout(
  ...parts: Array<string | null | undefined>
): boolean {
  const blob = parts.filter(Boolean).join("\n");
  return matchSafetyTopics(blob, { max: 1 }).length > 0;
}

/** Topic ids only — handy for tests / analytics. */
export function matchSafetyTopicIds(
  text: string,
  options: SafetyMatchOptions = {},
): string[] {
  return matchSafetyTopics(text, options).map((h) => h.topic.id);
}
