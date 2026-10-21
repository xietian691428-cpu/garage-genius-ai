/**
 * Derive intake slots from current + recent user text (ephemeral, per request).
 */

import { extractDtcCodes } from "@/lib/dtc-parse";
import type { EvidenceItem } from "@/lib/evidence/grades";
import { isLightingIntent } from "@/lib/lighting/intent";
import {
  EMPTY_INTAKE_SLOTS,
  type HousingConfirmSlot,
  type IntakeDeriveResult,
  type IntakeMissingSlot,
  type IntakeSlots,
  type LightingFunctionSlot,
  type LightingStructureSlot,
  type SideSlot,
} from "@/lib/intake/types";

const ROOT_CAUSE_ASK_RE =
  /\b(what('?s| is) (wrong|broken|bad|failing)|what (broke|failed)|root\s*cause|which (part|component)|is it the|到底什么|什么坏了|哪里坏了)\b/i;

const SUDDEN_RE =
  /\b(sudden(ly)?|all of a sudden|overnight|just (started|happened)|一夜|突然)\b/i;
const GRADUAL_RE =
  /\b(gradual(ly)?|over time|getting worse|slowly|渐渐|慢慢)\b/i;
const INTERMITTENT_RE =
  /\b(intermittent|comes and goes|sometimes|on and off|偶尔|时有时无)\b/i;
const CONSTANT_RE =
  /\b(constant|always|every time|won'?t go away|一直|始终)\b/i;

const AFTER_EVENT_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\b(collision|accident|hit|crash|撞)\b/i, label: "collision" },
  { re: /\b(wash|car\s*wash|water|flood|雨|洗车)\b/i, label: "water" },
  {
    re: /\b(recent\s+repair|just\s+(serviced|repaired)|换过|修过)\b/i,
    label: "recent_repair",
  },
  {
    re: /\b(battery\s+(disconnect|replaced|changed)|换电瓶)\b/i,
    label: "battery_disconnect",
  },
  {
    re: /\b(led\s+upgrade|bulb\s+upgrade|换了.*(灯|泡))\b/i,
    label: "bulb_upgrade",
  },
];

const CONDITION_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\b(night\s*only|only\s+at\s+night|晚上才)\b/i, label: "night_only" },
  { re: /\b(wet|rain|潮湿)\b/i, label: "wet" },
  { re: /\b(cold\s*start|冷车)\b/i, label: "cold_start" },
  { re: /\b(highway|高速)\b/i, label: "highway" },
];

/** Dust-cap / replaceable bulb confirmation phrases (chips + free text). */
export function parseReplaceableHousingConfirm(text: string): boolean {
  return (
    /\b(dust\s*cap|dustcap|can\s+(unscrew|twist|open)|twist[-\s]?off|replaceable\s+bulb|halogen\s+(bulb|housing)|behind.*(cap|cover)|拧开|防尘盖|可换泡)\b/i.test(
      text,
    ) ||
    /\b(dust\s*cap\s+(visible|vs)|confirm(ed)?\s+dust)\b/i.test(text)
  );
}

/** Sealed / integrated LED confirmation. */
export function parseSealedHousingConfirm(text: string): boolean {
  return (
    /\b(sealed\s+(led|module|assembly|housing)|integrated\s+led|factory\s+led|oem\s+led|heatsink|no\s+bulb\s+access|matrix\s+led|adaptive\s+(led|headlight)|原厂\s*led|密封|总成)\b/i.test(
      text,
    ) || /\b(heatsink\s+sealed|sealed\s+module)\b/i.test(text)
  );
}

export function parseLightingStructureFromText(
  text: string,
): LightingStructureSlot {
  if (parseSealedHousingConfirm(text)) return "sealed_or_integrated_led";
  if (parseReplaceableHousingConfirm(text)) return "replaceable_bulb";
  return "unknown";
}

export function parseHousingConfirmFromText(text: string): HousingConfirmSlot {
  if (parseSealedHousingConfirm(text)) return "heatsink_sealed_module";
  if (parseReplaceableHousingConfirm(text)) return "dust_cap_visible";
  if (/\b(photo|picture|image|照片)\b/i.test(text)) return "photo_noted";
  return "unset";
}

function parseLightingFunction(text: string): LightingFunctionSlot {
  const low = /\b(low\s*beam|dipped|近光)\b/i.test(text);
  const high = /\b(high\s*beam|main\s*beam|远光)\b/i.test(text);
  const drl = /\b(drl|daytime\s+running)\b/i.test(text);
  const fog = /\b(fog\s*(light|lamp)|雾灯)\b/i.test(text);
  const turn = /\b(turn\s*signal|blinker|indicator|转向灯)\b/i.test(text);
  const hits = [low, high, drl, fog, turn].filter(Boolean).length;
  if (hits > 1) return "mixed";
  if (low) return "low_beam";
  if (high) return "high_beam";
  if (drl) return "drl";
  if (fog) return "fog";
  if (turn) return "turn";
  return "unknown";
}

function parseSide(text: string): SideSlot {
  const left = /\b(left|driver('?s)?\s*side|左侧|左边)\b/i.test(text);
  const right = /\b(right|passenger('?s)?\s*side|右侧|右边)\b/i.test(text);
  if (left && right) return "both";
  if (/\b(both\s*sides|两侧)\b/i.test(text)) return "both";
  if (left) return "left";
  if (right) return "right";
  return "unknown";
}

function compressSymptom(text: string): string | null {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length < 8) return null;
  return t.length > 160 ? `${t.slice(0, 157)}…` : t;
}

function mergeBlob(current: string, recent: string[]): string {
  return [current, ...recent].filter(Boolean).join("\n");
}

/**
 * Build intake from this turn + optional recent user turns (no DB write).
 */
export function deriveIntake(options: {
  currentUserMessage: string;
  recentUserTexts?: string[];
}): IntakeDeriveResult {
  const current = options.currentUserMessage || "";
  const recent = options.recentUserTexts || [];
  const blob = mergeBlob(current, recent);
  const lightingIntent = isLightingIntent(current) || isLightingIntent(blob);

  const slots: IntakeSlots = { ...EMPTY_INTAKE_SLOTS };
  slots.symptom_summary = compressSymptom(current);
  slots.dtc_list = extractDtcCodes(blob).slice(0, 12);
  slots.side = parseSide(blob);
  slots.lighting_function = parseLightingFunction(blob);

  if (SUDDEN_RE.test(blob)) {
    slots.sudden_or_gradual = "sudden";
    slots.when_started = slots.when_started || "sudden onset (owner)";
  } else if (GRADUAL_RE.test(blob)) {
    slots.sudden_or_gradual = "gradual";
    slots.when_started = slots.when_started || "gradual onset (owner)";
  }

  if (/\b(started|began|since|from|开始|自从)\b/i.test(blob) && !slots.when_started) {
    const m = blob.match(
      /\b((?:started|began|since|from)\s+[^.!?\n]{3,40})/i,
    );
    if (m) slots.when_started = m[1].trim().slice(0, 80);
  }

  if (INTERMITTENT_RE.test(blob)) slots.intermittent_or_constant = "intermittent";
  else if (CONSTANT_RE.test(blob)) slots.intermittent_or_constant = "constant";

  for (const { re, label } of AFTER_EVENT_PATTERNS) {
    if (re.test(blob)) {
      slots.after_event = slots.after_event
        ? `${slots.after_event}; ${label}`
        : label;
    }
  }
  for (const { re, label } of CONDITION_PATTERNS) {
    if (re.test(blob) && !slots.conditions.includes(label)) {
      slots.conditions.push(label);
    }
  }
  if (/\b(already\s+(tried|checked|replaced)|tried\s+.*already|已经试过)\b/i.test(blob)) {
    slots.already_tried = "owner mentioned prior attempts";
  }

  const structure = parseLightingStructureFromText(blob);
  slots.lighting_structure = structure;
  slots.housing_confirm = parseHousingConfirmFromText(blob);
  if (structure !== "unknown") {
    // User confirmed a structure — mark confirmed_by_user conceptually via housing
    if (slots.housing_confirm === "unset") {
      slots.housing_confirm =
        structure === "replaceable_bulb"
          ? "dust_cap_visible"
          : "heatsink_sealed_module";
    }
  }

  if (/\b(le\s*|xle|se|sport|touring|package|trim)\b/i.test(blob)) {
    const trimM = blob.match(/\b((?:le|xle|se|sport|touring)\s*(?:package|trim)?)\b/i);
    slots.trim_or_package = trimM ? trimM[1].slice(0, 40) : "mentioned";
  }

  const evidenceItems: EvidenceItem[] = [];
  if (slots.dtc_list.length) {
    evidenceItems.push({
      grade: "OBSERVED",
      text: `DTC(s) in message/snapshot: ${slots.dtc_list.join(", ")}`,
    });
  }
  if (structure === "replaceable_bulb") {
    evidenceItems.push({
      grade: "OBSERVED",
      text: "Owner confirmed replaceable-bulb / dust-cap style housing (session).",
    });
  } else if (structure === "sealed_or_integrated_led") {
    evidenceItems.push({
      grade: "OBSERVED",
      text: "Owner confirmed sealed/integrated LED or heatsink-style module (session).",
    });
  } else if (lightingIntent) {
    evidenceItems.push({
      grade: "UNVERIFIED",
      text: "Lighting housing structure not confirmed — bulb sizes and buy paths stay blocked.",
    });
  }
  if (slots.after_event) {
    evidenceItems.push({
      grade: "REPORTED",
      text: `Possible after-event association: ${slots.after_event}`,
    });
  }
  if (slots.when_started) {
    evidenceItems.push({
      grade: "REPORTED",
      text: `Onset: ${slots.when_started}`,
    });
  }

  const observed = evidenceItems.some((e) => e.grade === "OBSERVED");
  slots.evidence_level = observed
    ? "OBSERVED"
    : evidenceItems.some((e) => e.grade === "REPORTED")
      ? "REPORTED"
      : lightingIntent || slots.dtc_list.length
        ? "UNVERIFIED"
        : "INFERRED";

  const seekingRootCause = ROOT_CAUSE_ASK_RE.test(current);
  const missingCritical: IntakeMissingSlot[] = [];

  if (lightingIntent && structure === "unknown") {
    missingCritical.push("lighting_structure");
    if (slots.housing_confirm === "unset") missingCritical.push("housing_confirm");
  }

  if (
    seekingRootCause &&
    !lightingIntent &&
    !slots.when_started &&
    slots.sudden_or_gradual === "unknown"
  ) {
    missingCritical.push("when_started");
  }
  if (
    seekingRootCause &&
    !lightingIntent &&
    slots.intermittent_or_constant === "unknown"
  ) {
    missingCritical.push("intermittent_or_constant");
  }
  if (
    seekingRootCause &&
    !lightingIntent &&
    slots.side === "unknown" &&
    /\b(light|lamp|side|mirror|wheel|brake|turn)\b/i.test(blob)
  ) {
    missingCritical.push("side");
  }

  const preferIntakeQuestions =
    missingCritical.length > 0 &&
    (lightingIntent || seekingRootCause) &&
    missingCritical.slice(0, 3).length > 0;

  return {
    slots,
    missingCritical: missingCritical.slice(0, 3),
    evidenceItems,
    lightingIntent,
    seekingRootCause,
    preferIntakeQuestions,
  };
}

/** Chip labels for missing slots (en-US). */
export function intakeChipPrompts(
  missing: IntakeMissingSlot[],
  lightingIntent: boolean,
): string[] {
  const chips: string[] = [];
  for (const m of missing) {
    if (m === "lighting_structure" || m === "housing_confirm") {
      chips.push("Dust cap I can unscrew");
      chips.push("Sealed / heatsink LED module");
      continue;
    }
    if (m === "when_started") chips.push("Started suddenly");
    if (m === "intermittent_or_constant") chips.push("It comes and goes");
    if (m === "side") chips.push("Left side only");
  }
  if (lightingIntent && !chips.some((c) => /dust|sealed/i.test(c))) {
    chips.unshift("Dust cap vs sealed module?");
  }
  return [...new Set(chips)].slice(0, 4);
}
