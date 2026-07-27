/**
 * DIY skill bands (段位) — vehicle-aware coaching tone.
 * Prompt prefixes live here (versioned with code). DB table skill_assessment_config
 * is an optional ops override, not required at runtime.
 */

export const DIY_SKILL_LEVELS = [
  "beginner",
  "enthusiast",
  "professional",
] as const;

export type DiySkillLevel = (typeof DIY_SKILL_LEVELS)[number];

export type DiySkillSource = "default" | "self" | "inferred" | "manual";

export type DiySkillConfig = {
  level: DiySkillLevel;
  label: string;
  shortHint: string;
  /** Injected into chat system prompt */
  systemPromptPrefix: string;
  /** Soft RAG: prefer these categories (boost, never hard-exclude) */
  ragPreferCategories: string[];
  /** Soft RAG: boost sources containing these substrings */
  ragPreferSources: string[];
  detailCoefficient: number;
};

export const DIY_SKILL_CONFIG: Record<DiySkillLevel, DiySkillConfig> = {
  beginner: {
    level: "beginner",
    label: "Beginner",
    shortHint: "I'm learning — keep it simple & safe",
    systemPromptPrefix: `## User DIY skill: BEGINNER
Adapt all coaching to a careful first-time / early DIY owner:
- Plain language. Define jargon the first time (e.g. "torque = how tight, in ft-lb").
- Lead with safety: jack stands, eye protection, battery disconnect when relevant.
- Prefer short numbered steps; say when to STOP and see a shop.
- Do NOT dump oscilloscope / waveform / advanced diagnostics unless they ask.
- Encourage confidence without shame.`,
    ragPreferCategories: [
      "safety",
      "basics",
      "general",
      "brake",
      "filter",
      "maintenance",
    ],
    ragPreferSources: ["manual", "common_fault", "flywheel_golden"],
    detailCoefficient: 1.2,
  },
  enthusiast: {
    level: "enthusiast",
    label: "Enthusiast",
    shortHint: "I wrench weekends — balanced depth",
    systemPromptPrefix: `## User DIY skill: ENTHUSIAST
Weekend mechanic who has done basic jobs (pads, oil, plugs):
- Clear steps + tool names; include torque / fluid specs when known for this vehicle.
- Mix safety notes with efficient procedure — not hand-holding every bolt.
- OK to mention common failure patterns and DIY vs shop trade-offs.`,
    ragPreferCategories: [
      "repair",
      "diagnostics",
      "maintenance",
      "general",
      "brake",
      "engine",
    ],
    ragPreferSources: ["manual", "tsb", "user_feedback", "flywheel_golden"],
    detailCoefficient: 1.0,
  },
  professional: {
    level: "professional",
    label: "Advanced",
    shortHint: "I want dense, tech-level answers",
    systemPromptPrefix: `## User DIY skill: ADVANCED / PROFESSIONAL
Assume tool literacy and comfort with torque, scan tools, and shop manuals:
- Dense, precise answers — skip "what is a socket" style padding.
- Prefer OEM procedures, torque tables, DTC logic, and failure trees.
- Still flag high-risk safety (airbags, fuel, high-voltage EV) briefly.
- Do not oversimplify; do not invent specs — cite vehicle config / RAG.`,
    ragPreferCategories: [
      "repair",
      "diagnostics",
      "manual",
      "tsb",
      "engine",
      "electrical",
    ],
    ragPreferSources: ["manual", "tsb", "vcdb_config", "flywheel_golden"],
    detailCoefficient: 0.85,
  },
};

export function normalizeDiySkill(raw: unknown): DiySkillLevel {
  const s = String(raw || "")
    .trim()
    .toLowerCase();
  if (s === "professional" || s === "pro" || s === "advanced") {
    return "professional";
  }
  if (s === "enthusiast" || s === "intermediate" || s === "hobbyist") {
    return "enthusiast";
  }
  return "beginner";
}

export function getDiySkillConfig(level: DiySkillLevel | string): DiySkillConfig {
  return DIY_SKILL_CONFIG[normalizeDiySkill(level)];
}

export function formatDiySkillPromptBlock(
  level: DiySkillLevel | string | null | undefined,
): string {
  return getDiySkillConfig(level || "beginner").systemPromptPrefix;
}

/** Soft score boost for RAG ranking (higher = preferred for this skill). */
export function ragSkillBoost(
  hit: { category?: string | null; source?: string | null },
  level: DiySkillLevel,
): number {
  const cfg = DIY_SKILL_CONFIG[level];
  const cat = (hit.category || "").toLowerCase();
  const src = (hit.source || "").toLowerCase();
  let boost = 0;
  for (const c of cfg.ragPreferCategories) {
    if (cat.includes(c.toLowerCase())) boost += 2;
  }
  for (const s of cfg.ragPreferSources) {
    if (src.includes(s.toLowerCase())) boost += 1;
  }
  // Beginners: lightly demote dense TSB-only hits unless also safety/basics
  if (level === "beginner" && src.includes("tsb") && boost < 2) {
    boost -= 1;
  }
  return boost;
}

export const DIY_SKILL_OPTIONS: Array<{
  value: DiySkillLevel;
  label: string;
  hint: string;
}> = DIY_SKILL_LEVELS.map((level) => ({
  value: level,
  label: DIY_SKILL_CONFIG[level].label,
  hint: DIY_SKILL_CONFIG[level].shortHint,
}));
