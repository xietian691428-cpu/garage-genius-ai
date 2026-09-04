/**
 * Product-intent tags for “do we still need paid repair data?”
 * Tags only — never store the user message, VIN, or a diagnosis.
 *
 * Revisit Auto.dev / commercial TSB only when share is high AND
 * NHTSA + playbooks + “check the manual” still cannot cover the ask.
 */

export const SPEC_GAP_TAGS = [
  "oil_viscosity_capacity",
  "maintenance_interval",
  "torque",
] as const;

export type SpecGapTag = (typeof SPEC_GAP_TAGS)[number];

export const SPEC_GAP_LABELS: Record<SpecGapTag, string> = {
  oil_viscosity_capacity: "Oil viscosity / capacity",
  maintenance_interval: "Maintenance interval",
  torque: "Torque spec",
};

/** Share of Chat LLM turns that must hit a tag before volume alone is “high”. */
export const SPEC_GAP_REVISIT_SHARE = 0.15;

const TAG_SET = new Set<string>(SPEC_GAP_TAGS);

export function isSpecGapTag(value: unknown): value is SpecGapTag {
  return typeof value === "string" && TAG_SET.has(value);
}

export function parseSpecGapTags(raw: unknown): SpecGapTag[] {
  if (!Array.isArray(raw)) return [];
  const out: SpecGapTag[] = [];
  for (const item of raw) {
    if (isSpecGapTag(item) && !out.includes(item)) out.push(item);
  }
  return out;
}

function hasOilViscosityOrCapacity(t: string): boolean {
  if (
    /\b(0w-?16|0w-?20|5w-?20|5w-?30|5w-?40|10w-?30|10w-?40)\b/i.test(t)
  ) {
    return true;
  }
  if (
    /\b(oil\s*(viscosity|weight|grade|spec|capacity|type)|viscosity|oil\s+to\s+use)\b/i.test(
      t,
    )
  ) {
    return true;
  }
  if (
    /\b(how many|how much)\s+(quarts?|qt|liters?|litres?|l)\s+(of\s+)?(engine\s+)?oil\b/i.test(
      t,
    )
  ) {
    return true;
  }
  if (/\b(oil\s+(quarts?|fill|capacity)|quarts?\s+of\s+oil)\b/i.test(t)) {
    return true;
  }
  if (/\bwhat\s+(engine\s+)?oil\s+(should|do|does|to)\b/i.test(t)) {
    return true;
  }
  return false;
}

function hasMaintenanceInterval(t: string): boolean {
  if (
    /\b(maintenance|service)\s+(interval|schedule|due|period)\b/i.test(t)
  ) {
    return true;
  }
  if (
    /\b(oil[\s-]?change|spark plugs?|cabin filter|air filter|coolant flush)\s+(interval|schedule|due)\b/i.test(
      t,
    )
  ) {
    return true;
  }
  if (/\b(how often|every how many miles|miles between)\b/i.test(t)) {
    return true;
  }
  if (
    /\bwhen\s+(should|do)\s+i\s+(change|replace|service)\b/i.test(t)
  ) {
    return true;
  }
  if (/\b(due for (an )?oil|next oil change|oil change interval)\b/i.test(t)) {
    return true;
  }
  return false;
}

function hasTorqueSpec(t: string): boolean {
  if (/\btorque\s+(converter|steer|curve|output)\b/i.test(t)) return false;
  if (/\b(torque spec(?:ification)?s?|in-?lbs?|inch[-\s]?pounds?)\b/i.test(t)) {
    return true;
  }
  if (/\b(ft-?lbs?|foot[-\s]?pounds?|n[·.]?m|newton[-\s]?met)\b/i.test(t)) {
    return true;
  }
  if (/\b(lug (nut )?torque|how tight|torque wrench)\b/i.test(t)) {
    return true;
  }
  if (/\b(what|which)\s+torque\b/i.test(t)) return true;
  if (/\btorque\s+(for|on|spec)\b/i.test(t)) return true;
  return false;
}

/**
 * Classify a user question. Empty / VIN-only strings yield no tags.
 */
export function classifySpecGapIntents(text: string): SpecGapTag[] {
  const t = (text || "").replace(/\s+/g, " ").trim();
  if (t.length < 4) return [];

  const tags: SpecGapTag[] = [];
  if (hasOilViscosityOrCapacity(t)) tags.push("oil_viscosity_capacity");
  if (hasMaintenanceInterval(t)) tags.push("maintenance_interval");
  if (hasTorqueSpec(t)) tags.push("torque");
  return tags;
}

export type SpecGapTopicStat = {
  tag: SpecGapTag;
  label: string;
  hits: number;
  share: number;
};

export type SpecGapStats = {
  chatCalls: number;
  taggedCalls: number;
  taggedShare: number;
  topics: SpecGapTopicStat[];
  /** Volume-only trigger — not permission to buy Auto.dev. */
  volumeTrigger: boolean;
  revisitShare: number;
};

export function emptySpecGapStats(): SpecGapStats {
  return {
    chatCalls: 0,
    taggedCalls: 0,
    taggedShare: 0,
    topics: SPEC_GAP_TAGS.map((tag) => ({
      tag,
      label: SPEC_GAP_LABELS[tag],
      hits: 0,
      share: 0,
    })),
    volumeTrigger: false,
    revisitShare: SPEC_GAP_REVISIT_SHARE,
  };
}

export function aggregateSpecGapStats(
  chatEvents: Array<{ tags: SpecGapTag[] }>,
): SpecGapStats {
  const chatCalls = chatEvents.length;
  const counts: Record<SpecGapTag, number> = {
    oil_viscosity_capacity: 0,
    maintenance_interval: 0,
    torque: 0,
  };
  let taggedCalls = 0;
  for (const ev of chatEvents) {
    const tags = [...new Set(ev.tags.filter(isSpecGapTag))];
    if (!tags.length) continue;
    taggedCalls += 1;
    for (const tag of tags) counts[tag] += 1;
  }
  const topics: SpecGapTopicStat[] = SPEC_GAP_TAGS.map((tag) => ({
    tag,
    label: SPEC_GAP_LABELS[tag],
    hits: counts[tag],
    share: chatCalls > 0 ? counts[tag] / chatCalls : 0,
  }));
  const taggedShare = chatCalls > 0 ? taggedCalls / chatCalls : 0;
  const volumeTrigger = topics.some(
    (t) => t.share >= SPEC_GAP_REVISIT_SHARE && t.hits >= 20,
  );
  return {
    chatCalls,
    taggedCalls,
    taggedShare,
    topics,
    volumeTrigger,
    revisitShare: SPEC_GAP_REVISIT_SHARE,
  };
}

/** Metadata stamp for token_usage_events — tags only. */
export function specGapMetadata(
  tags: SpecGapTag[],
): { spec_gap: SpecGapTag[] } | Record<string, never> {
  return tags.length ? { spec_gap: tags } : {};
}
