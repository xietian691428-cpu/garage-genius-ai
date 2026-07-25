import {
  FOCUS_PART_IDS,
  type FocusCommand,
  type FocusPartId,
} from "@/lib/types/focus";
import type { RagKnowledgeHit } from "@/lib/types/rag";
import { getDashboardRegion } from "@/lib/dashboard-regions";

const FOCUS_TAG_REGEX = /<focus>\s*([a-z0-9_\-\s]+)\s*<\/focus>/i;
const FOCUS_DATA_REGEX = /<focus-data>\s*([\s\S]*?)\s*<\/focus-data>/i;
const FOCUS_JSON_FENCE_REGEX = /```(?:focus-json|json)\s*\n([\s\S]*?)\n```/i;

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
    message: typeof obj.message === "string" ? obj.message.trim() : undefined,
    action: typeof obj.action === "string" ? obj.action.trim() : undefined,
    steps: asStringArray(obj.steps),
    tools: asStringArray(obj.tools),
    safetyNotes:
      asStringArray(obj.safetyNotes) ?? asStringArray(obj.safety),
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

  const ranked = [...hits].sort(
    (a, b) => (b.similarity ?? 0) - (a.similarity ?? 0),
  );

  for (const hit of ranked) {
    // 1) Explicit markers inside knowledge content / title
    const fromContent = extractFocusCommand(
      `${hit.title ?? ""}\n${hit.content ?? ""}`,
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
        part: meta.part ?? meta.region ?? meta.focusPart ?? meta.dashboard_region,
        message:
          typeof meta.message === "string"
            ? meta.message
            : hit.title || undefined,
        action: typeof meta.action === "string" ? meta.action : undefined,
        steps: meta.steps,
        tools: meta.tools,
        safetyNotes: meta.safetyNotes ?? meta.safety,
      });

    if (metaFocus) {
      return enrichFocusFromHit(metaFocus, hit);
    }

    // 3) category → dashboard part
    const fromCategory = normalizeFocusPart(hit.category);
    if (fromCategory) {
      return enrichFocusFromHit(
        {
          type: "focus",
          part: fromCategory,
          message: hit.title
            ? `Focus on ${hit.title}`
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
  const stepsFromContent = extractNumberedSteps(hit.content);
  return {
    ...command,
    message: command.message || hit.title || undefined,
    steps:
      command.steps && command.steps.length > 0
        ? command.steps
        : stepsFromContent,
  };
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
  if (!fromReply && !fromRag) return null;
  if (!fromReply) return fromRag;
  if (!fromRag) return fromReply;

  return {
    type: "focus",
    part: fromReply.part,
    message: fromReply.message || fromRag.message,
    action: fromReply.action || fromRag.action,
    steps:
      fromReply.steps && fromReply.steps.length > 0
        ? fromReply.steps
        : fromRag.steps,
    tools:
      fromReply.tools && fromReply.tools.length > 0
        ? fromReply.tools
        : fromRag.tools,
    safetyNotes:
      fromReply.safetyNotes && fromReply.safetyNotes.length > 0
        ? fromReply.safetyNotes
        : fromRag.safetyNotes,
  };
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

/** Build display steps when AI only sent part/action. */
export function buildFocusSteps(command: FocusCommand): string[] {
  if (command.steps && command.steps.length > 0) return command.steps;

  const region = getDashboardRegion(command.part);
  const steps: string[] = [];

  if (command.message) {
    steps.push(command.message);
  }
  if (command.action) {
    steps.push(`Primary action: ${humanizeAction(command.action)}.`);
  }
  if (region) {
    steps.push(...region.quickChecklist);
  }
  if (steps.length === 0) {
    steps.push("Inspect this area carefully and note anything unusual.");
  }
  return steps;
}

export function buildFocusTools(command: FocusCommand): string[] {
  if (command.tools && command.tools.length > 0) return command.tools;
  return [
    "Flashlight or phone light",
    "Gloves",
    "Basic hand tools (as needed)",
    "Phone for photos / voice coaching",
  ];
}

export function buildFocusSafety(command: FocusCommand): string[] {
  if (command.safetyNotes && command.safetyNotes.length > 0) {
    return command.safetyNotes;
  }
  return [
    "Park on level ground, set the parking brake, and chock wheels if needed.",
    "Never work under a vehicle supported only by a jack.",
    "If unsure or unsafe, stop and consult a licensed mechanic.",
  ];
}
