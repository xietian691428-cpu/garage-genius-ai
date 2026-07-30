import {
  FOCUS_PART_IDS,
  type FocusCommand,
  type FocusPartId,
} from "@/lib/types/focus";
import type { RagKnowledgeHit } from "@/lib/types/rag";
import { getDashboardRegion } from "@/lib/dashboard-regions";
import {
  containsCjkText,
  filterEnglishKnowledgeHits,
  isNonEnglishKnowledgeHit,
  logCjkRagLeakage,
} from "@/lib/rag-language-guard";

const FOCUS_TAG_REGEX = /<focus>\s*([a-z0-9_\-\s]+)\s*<\/focus>/i;
const FOCUS_DATA_REGEX = /<focus-data>\s*([\s\S]*?)\s*<\/focus-data>/i;
const FOCUS_JSON_FENCE_REGEX = /```(?:focus-json|json)\s*\n([\s\S]*?)\n```/i;

/** Fixed EN checklist when Focus has no safe English steps after sanitization. */
export const FOCUS_ENGLISH_FALLBACK_CHECKLIST: string[] = [
  "Confirm the vehicle is safe to inspect (parked, brake set, cool if needed).",
  "Visually check the highlighted area for leaks, damage, loose connectors, or wear.",
  "Note any warning lights, unusual smells, noises, or recent work.",
  "If a code is available, enter it or upload an OBD screenshot — do not guess.",
  "If unsure or the repair is high-risk, stop and consult a qualified technician.",
];

export { containsCjkText };

function englishOnlyString(
  value?: string | null,
  logPath?: string,
): string | undefined {
  if (!value?.trim()) return undefined;
  if (containsCjkText(value)) {
    if (logPath) {
      logCjkRagLeakage({
        path: logPath,
        reason: "focus.field",
        title: value,
      });
    }
    return undefined;
  }
  return value.trim();
}

function englishOnlyStrings(
  values?: string[],
  logPath?: string,
): string[] | undefined {
  if (!values?.length) return undefined;
  const list = values
    .map((s) => englishOnlyString(s, logPath))
    .filter((s): s is string => Boolean(s));
  return list.length > 0 ? list : undefined;
}

/** Drop CJK strings from a Focus payload; keep part / English fields. */
export function sanitizeFocusCommand(
  command: FocusCommand | null,
  path = "focus.sanitizeFocusCommand",
): FocusCommand | null {
  if (!command) return null;

  const hadCjk =
    containsCjkText(command.message) ||
    containsCjkText(command.action) ||
    (command.steps || []).some((s) => containsCjkText(s)) ||
    (command.tools || []).some((s) => containsCjkText(s)) ||
    (command.safetyNotes || []).some((s) => containsCjkText(s));

  if (hadCjk) {
    logCjkRagLeakage({
      path,
      reason: "focus.field",
      title: command.message || command.action || command.part,
    });
  }

  return {
    type: "focus",
    part: command.part,
    message: englishOnlyString(command.message),
    action: englishOnlyString(command.action),
    steps: englishOnlyStrings(command.steps),
    tools: englishOnlyStrings(command.tools),
    safetyNotes: englishOnlyStrings(command.safetyNotes),
  };
}

const PART_ALIASES: Record<string, FocusPartId> = {
  engine: "engine",
  "engine bay": "engine",
  powertrain: "engine",
  motor: "engine",
  brakes: "brakes",
  brake: "brakes",
  "brake system": "brakes",
  suspension: "suspension",
  shocks: "suspension",
  struts: "suspension",
  battery: "battery",
  electrical: "battery",
  "battery & electrical": "battery",
  alternator: "battery",
  tires: "tires",
  tire: "tires",
  wheels: "tires",
  "tires & wheels": "tires",
  hvac: "hvac",
  climate: "hvac",
  "climate control": "hvac",
  heater: "hvac",
  heating: "hvac",
  "cabin filter": "hvac",
  ac: "ac",
  "a/c": "ac",
  "air conditioning": "ac",
  "air conditioner": "ac",
  refrigerant: "ac",
  transmission: "transmission",
  gearbox: "transmission",
  trans: "transmission",
  "cvt": "transmission",
  lights: "lights",
  lighting: "lights",
  headlights: "lights",
  headlight: "lights",
  taillights: "lights",
  "turn signal": "lights",
  bulbs: "lights",
};

/** Map knowledge_base.category → dashboard Focus part */
const CATEGORY_TO_PART: Record<string, FocusPartId> = {
  engine: "engine",
  powertrain: "engine",
  brake: "brakes",
  brakes: "brakes",
  suspension: "suspension",
  chassis: "suspension",
  electrical: "battery",
  battery: "battery",
  charging: "battery",
  tire: "tires",
  tires: "tires",
  wheels: "tires",
  hvac: "hvac",
  climate: "hvac",
  ac: "ac",
  "air conditioning": "ac",
  transmission: "transmission",
  drivetrain: "transmission",
  lights: "lights",
  lighting: "lights",
  exterior: "lights",
};

export function normalizeFocusPart(
  raw: string | null | undefined,
): FocusPartId | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase().replace(/[_]+/g, " ");
  if (PART_ALIASES[key]) return PART_ALIASES[key];
  if (CATEGORY_TO_PART[key]) return CATEGORY_TO_PART[key];
  const compact = key.replace(/\s+/g, "");
  for (const id of FOCUS_PART_IDS) {
    if (id === compact || id.replace(/s$/, "") === compact.replace(/s$/, "")) {
      return id;
    }
  }
  return null;
}

function humanizeAction(action: string): string {
  return action
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\w/, (c) => c.toUpperCase());
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const list = value.filter(
    (s): s is string => typeof s === "string" && s.trim().length > 0,
  );
  return list.length > 0 ? list : undefined;
}

function parseFocusObject(raw: unknown): FocusCommand | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const part = normalizeFocusPart(
    typeof obj.part === "string"
      ? obj.part
      : typeof obj.region === "string"
        ? obj.region
        : typeof obj.regionId === "string"
          ? obj.regionId
          : typeof obj.focusPart === "string"
            ? obj.focusPart
            : null,
  );
  if (!part) return null;

  return {
    type: "focus",
    part,
    message: englishOnlyString(
      typeof obj.message === "string" ? obj.message.trim() : undefined,
    ),
    action: englishOnlyString(
      typeof obj.action === "string" ? obj.action.trim() : undefined,
    ),
    steps: englishOnlyStrings(asStringArray(obj.steps)),
    tools: englishOnlyStrings(asStringArray(obj.tools)),
    safetyNotes: englishOnlyStrings(
      asStringArray(obj.safetyNotes) ?? asStringArray(obj.safety),
    ),
  };
}

/** Extract Focus Mode command from an assistant reply (if any). */
export function extractFocusCommand(content: string): FocusCommand | null {
  if (!content?.trim()) return null;

  const dataMatch = content.match(FOCUS_DATA_REGEX);
  if (dataMatch?.[1]) {
    try {
      const parsed = JSON.parse(dataMatch[1]) as unknown;
      const cmd = parseFocusObject(parsed);
      if (cmd) return cmd;
    } catch {
      // fall through
    }
  }

  const fenceMatch = content.match(FOCUS_JSON_FENCE_REGEX);
  if (fenceMatch?.[1]) {
    try {
      const parsed = JSON.parse(fenceMatch[1]) as unknown;
      const cmd = parseFocusObject(parsed);
      if (cmd) return cmd;
    } catch {
      // fall through
    }
  }

  const inlineMatch = content.match(
    /\{\s*"type"\s*:\s*"focus"\s*,[\s\S]*?\}/,
  );
  if (inlineMatch?.[0]) {
    try {
      const cmd = parseFocusObject(JSON.parse(inlineMatch[0]));
      if (cmd) return cmd;
    } catch {
      // fall through
    }
  }

  const tagMatch = content.match(FOCUS_TAG_REGEX);
  if (tagMatch?.[1]) {
    const part = normalizeFocusPart(tagMatch[1]);
    if (part) {
      return { type: "focus", part };
    }
  }

  return null;
}

/**
 * Infer Focus Mode from RAG hits (category, metadata, or embedded markers).
 * Prefers the highest-similarity hit that yields a part.
 */
export function extractFocusFromRagHits(
  hits: RagKnowledgeHit[] | null | undefined,
): FocusCommand | null {
  if (!hits?.length) return null;

  // Hard-exclude zh / CJK hits (logs blocked ids) — never use Chinese title/content.
  const englishHits = filterEnglishKnowledgeHits(
    hits,
    "focus.extractFocusFromRagHits",
  );
  const ranked = [...englishHits].sort(
    (a, b) => (b.similarity ?? 0) - (a.similarity ?? 0),
  );

  for (const hit of ranked) {
    // Never feed Chinese title/content into Focus parsers.
    if (containsCjkText(hit.title) || containsCjkText(hit.content)) {
      logCjkRagLeakage({
        path: "focus.extractFocusFromRagHits.skip",
        reason: "focus.field",
        hitId: hit.id,
        title: hit.title,
      });
      continue;
    }

    const safeTitle = englishOnlyString(hit.title);
    const safeContent = hit.content?.trim() || "";

    // 1) Explicit markers inside knowledge content / title
    const fromContent = extractFocusCommand(
      `${safeTitle ?? ""}\n${safeContent}`,
    );
    if (fromContent) {
      return enrichFocusFromHit(fromContent, hit);
    }

    // 2) metadata.focus / part / region / focusPart
    const meta = hit.metadata ?? {};
    const metaFocus =
      parseFocusObject(meta.focus) ||
      parseFocusObject({
        type: "focus",
        part:
          meta.part ?? meta.region ?? meta.focusPart ?? meta.dashboard_region,
        message:
          typeof meta.message === "string" && !containsCjkText(meta.message)
            ? meta.message
            : safeTitle || undefined,
        action:
          typeof meta.action === "string" && !containsCjkText(meta.action)
            ? meta.action
            : undefined,
        steps: meta.steps,
        tools: meta.tools,
        safetyNotes: meta.safetyNotes ?? meta.safety,
      });

    if (metaFocus) {
      return enrichFocusFromHit(metaFocus, hit);
    }

    // 3) category → dashboard part (English message only — never Chinese titles)
    const fromCategory = normalizeFocusPart(hit.category);
    if (fromCategory) {
      return enrichFocusFromHit(
        {
          type: "focus",
          part: fromCategory,
          message: safeTitle
            ? `Focus on ${safeTitle}`
            : `Primary area: ${fromCategory}`,
        },
        hit,
      );
    }
  }

  return null;
}

function enrichFocusFromHit(
  command: FocusCommand,
  hit: RagKnowledgeHit,
): FocusCommand {
  // Refuse Chinese content for steps/message even if somehow present.
  if (containsCjkText(hit.title) || containsCjkText(hit.content)) {
    logCjkRagLeakage({
      path: "focus.enrichFocusFromHit",
      reason: "focus.field",
      hitId: hit.id,
      title: hit.title,
    });
    return (
      sanitizeFocusCommand({
        type: "focus",
        part: command.part,
        message: `Primary area: ${command.part}`,
      })!
    );
  }

  const stepsFromContent = englishOnlyStrings(
    extractNumberedSteps(hit.content),
    "focus.enrichFocusFromHit.steps",
  );
  const englishTitle = englishOnlyString(hit.title);
  return sanitizeFocusCommand({
    ...command,
    message: englishOnlyString(command.message) || englishTitle || undefined,
    steps:
      command.steps && command.steps.length > 0
        ? englishOnlyStrings(command.steps)
        : stepsFromContent,
  })!;
}

/** Pull short numbered diagnostic/repair lines from knowledge text. */
function extractNumberedSteps(content: string | undefined): string[] | undefined {
  if (!content) return undefined;
  const lines = content.split(/\n+/);
  const steps: string[] = [];
  for (const line of lines) {
    const m = line.match(/^\s*(?:\d+[\).]|[-*])\s+(.+)/);
    if (m?.[1]) {
      const step = m[1].replace(/\*\*/g, "").trim();
      if (step.length > 8 && step.length < 220) steps.push(step);
    }
    if (steps.length >= 6) break;
  }
  return steps.length > 0 ? steps : undefined;
}

/** Merge AI reply focus with RAG-inferred focus (AI wins on part; RAG fills gaps). */
export function mergeFocusCommands(
  fromReply: FocusCommand | null,
  fromRag: FocusCommand | null,
): FocusCommand | null {
  const a = sanitizeFocusCommand(fromReply);
  const b = sanitizeFocusCommand(fromRag);
  if (!a && !b) return null;
  if (!a) return b;
  if (!b) return a;

  return sanitizeFocusCommand({
    type: "focus",
    part: a.part,
    message: a.message || b.message,
    action: a.action || b.action,
    steps:
      a.steps && a.steps.length > 0
        ? a.steps
        : b.steps,
    tools:
      a.tools && a.tools.length > 0
        ? a.tools
        : b.tools,
    safetyNotes:
      a.safetyNotes && a.safetyNotes.length > 0
        ? a.safetyNotes
        : b.safetyNotes,
  });
}

/**
 * Resolve Focus Mode from assistant text + optional RAG hits.
 * Use this in Chat after /api/chat returns.
 */
export function resolveFocusCommand(
  assistantContent: string,
  ragHits?: RagKnowledgeHit[] | null,
): FocusCommand | null {
  return mergeFocusCommands(
    extractFocusCommand(assistantContent),
    extractFocusFromRagHits(ragHits),
  );
}

/** Strip machine focus markers from user-visible markdown / TTS. */
export function stripFocusFromContent(content: string): string {
  return content
    .replace(FOCUS_DATA_REGEX, "")
    .replace(FOCUS_TAG_REGEX, "")
    .replace(/```(?:focus-json)\s*\n[\s\S]*?\n```/gi, "")
    .replace(/\{\s*"type"\s*:\s*"focus"\s*,[\s\S]*?\}/g, "")
    .trim();
}

/** Build display steps when AI only sent part/action. Never surfaces CJK. */
export function buildFocusSteps(command: FocusCommand): string[] {
  const englishSteps = englishOnlyStrings(
    command.steps,
    "focus.buildFocusSteps",
  );
  if (englishSteps && englishSteps.length > 0) return englishSteps;

  const region = getDashboardRegion(command.part);
  const steps: string[] = [];

  const message = englishOnlyString(command.message, "focus.buildFocusSteps");
  if (message) {
    steps.push(message);
  }
  const action = englishOnlyString(command.action, "focus.buildFocusSteps");
  if (action) {
    steps.push(`Primary action: ${humanizeAction(action)}.`);
  }
  if (region?.quickChecklist?.length) {
    steps.push(...region.quickChecklist);
  }
  if (steps.length === 0) {
    steps.push(...FOCUS_ENGLISH_FALLBACK_CHECKLIST);
  }
  return steps;
}

export function buildFocusTools(command: FocusCommand): string[] {
  const tools = englishOnlyStrings(command.tools);
  if (tools && tools.length > 0) return tools;
  return [
    "Flashlight or phone light",
    "Gloves",
    "Basic hand tools (as needed)",
    "Phone for photos / voice coaching",
  ];
}

export function buildFocusSafety(command: FocusCommand): string[] {
  const notes = englishOnlyStrings(command.safetyNotes);
  const base =
    notes && notes.length > 0
      ? notes
      : [
          "Park on level ground, set the parking brake, and chock wheels if needed.",
          "Never work under a vehicle supported only by a jack.",
          "If unsure or unsafe, stop and consult a licensed mechanic.",
          "This is general guidance only — verify with your owner’s manual before DIY work.",
        ];
  return base;
}
