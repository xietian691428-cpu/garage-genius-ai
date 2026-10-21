/**
 * Derive intake slots from current + recent user text (ephemeral, per request).
 */

import { extractDtcCodes } from "@/lib/dtc-parse";
import type { EvidenceItem } from "@/lib/evidence/grades";
import { isLightingIntent } from "@/lib/lighting/intent";
import {
  EMPTY_INTAKE_SLOTS,
  type BatteryCrankSymptom,
  type HousingConfirmSlot,
  type IntakeDeriveResult,
  type IntakeFocusIntent,
  type IntakeMissingSlot,
  type IntakeSlots,
  type LightingFunctionSlot,
  type LightingStructureSlot,
  type SideSlot,
  type YesNoUnknown,
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

const BATTERY_INTENT_RE =
  /\b(won'?t start|will not start|no start|doesn'?t start|dead battery|battery dead|clicking|clicks? when (I )?turn|slow crank|cranks?\s+slow|no crank|starter|jump[\s-]?start|12\s*v|cranking)\b/i;

const OVERHEAT_INTENT_RE =
  /\b(overheat(?:ing)?|temp(?:erature)?\s+(?:gauge|light)|gauge\s+(?:in\s+)?red|running hot|coolant\s+(?:hot|steam|boiling)|steam\s+(?:from|under|coming)|hot\s+engine|cooling\s+system)\b/i;

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

export function isBatteryCrankingIntent(text: string): boolean {
  return BATTERY_INTENT_RE.test(text || "");
}

export function isOverheatIntent(text: string): boolean {
  return OVERHEAT_INTENT_RE.test(text || "");
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

function parseBatterySymptom(text: string): BatteryCrankSymptom {
  if (/\b(starts?\s+then\s+(dies|stalls)|fires?\s+then\s+dies)\b/i.test(text)) {
    return "starts_then_dies";
  }
  if (/\b(click(?:ing|s)?|rapid\s+click)\b/i.test(text)) return "clicks";
  if (/\b(slow\s+crank|cranks?\s+slow|drags?|sluggish\s+crank)\b/i.test(text)) {
    return "slow_crank";
  }
  if (
    /\b(no\s+crank|won'?t\s+crank|nothing\s+(at\s+all|happens)|no\s+response|dead\s+silent|全程无反应)\b/i.test(
      text,
    )
  ) {
    return "no_crank";
  }
  if (/\b(won'?t start|will not start|no start|doesn'?t start)\b/i.test(text)) {
    return "unknown";
  }
  return "unknown";
}

function ynFrom(
  yesRe: RegExp,
  noRe: RegExp,
  text: string,
): YesNoUnknown {
  if (yesRe.test(text)) return "yes";
  if (noRe.test(text)) return "no";
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
function normalizeQuotes(s: string): string {
  return (s || "").replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"');
}

export function deriveIntake(options: {
  currentUserMessage: string;
  recentUserTexts?: string[];
}): IntakeDeriveResult {
  const current = normalizeQuotes(options.currentUserMessage || "");
  const recent = (options.recentUserTexts || []).map(normalizeQuotes);
  const blob = mergeBlob(current, recent);
  const lightingIntent = isLightingIntent(current) || isLightingIntent(blob);
  const batteryIntent =
    !lightingIntent &&
    (isBatteryCrankingIntent(current) || isBatteryCrankingIntent(blob));
  const overheatIntent =
    !lightingIntent &&
    !batteryIntent &&
    (isOverheatIntent(current) || isOverheatIntent(blob));

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
  if (structure !== "unknown" && slots.housing_confirm === "unset") {
    slots.housing_confirm =
      structure === "replaceable_bulb"
        ? "dust_cap_visible"
        : "heatsink_sealed_module";
  }

  if (/\b(le\s*|xle|se|sport|touring|package|trim)\b/i.test(blob)) {
    const trimM = blob.match(/\b((?:le|xle|se|sport|touring)\s*(?:package|trim)?)\b/i);
    slots.trim_or_package = trimM ? trimM[1].slice(0, 40) : "mentioned";
  }

  // Battery slots
  slots.battery_symptom = parseBatterySymptom(blob);
  slots.lights_dim = ynFrom(
    /\b(lights?\s+(are\s+)?dim|dim\s+lights?|interior\s+lights?\s+dim)\b/i,
    /\b(lights?\s+(are\s+)?(?:normal|bright|fine|ok|okay)|lights?\s+work\s+fine)\b/i,
    blob,
  );
  slots.recent_battery_work = ynFrom(
    /\b(recent\s+battery|just\s+(replaced|changed)\s+(the\s+)?battery|new\s+battery|换(了)?电瓶)\b/i,
    /\b(no\s+recent\s+battery|haven'?t\s+touched\s+(the\s+)?battery)\b/i,
    blob,
  );
  slots.weather_cold = ynFrom(
    /\b(cold\s+(?:weather|morning|night)|freezing|below\s+freezing|很冷)\b/i,
    /\b(warm\s+(?:day|weather)|not\s+cold)\b/i,
    blob,
  );
  const parked = blob.match(
    /\b(?:parked|sat|sitting)\s+(?:for\s+)?(\d+)\s*(?:days?|weeks?)\b/i,
  );
  if (parked) slots.parked_days = parked[0].slice(0, 40);

  // Overheat slots
  slots.temp_gauge_or_light = ynFrom(
    /\b(temp(?:erature)?\s+(?:gauge|light)|gauge\s+(?:in\s+)?red|overheat\s+light|temp\s+warning)\b/i,
    /\b(gauge\s+(?:is\s+)?normal|temp\s+(?:is\s+)?normal|no\s+temp\s+(?:light|warning))\b/i,
    blob,
  );
  slots.steam = ynFrom(
    /\b(steam|vapor|smoke\s+from\s+(?:hood|engine)|开锅)\b/i,
    /\b(no\s+steam|not\s+steaming)\b/i,
    blob,
  );
  slots.level_checked_cold = ynFrom(
    /\b(checked?\s+(?:coolant|level)\s+(?:when\s+)?cold|cold\s+(?:engine\s+)?(?:coolant\s+)?level|only\s+when\s+cold)\b/i,
    /\b(haven'?t\s+checked\s+(?:coolant|level)|checked?\s+(?:while\s+)?hot)\b/i,
    blob,
  );
  slots.recent_cooling_work = ynFrom(
    /\b(recent\s+(?:coolant|radiator|thermostat|hose)|just\s+(?:flushed|replaced)\s+coolant)\b/i,
    /\b(no\s+recent\s+(?:coolant|cooling))\b/i,
    blob,
  );

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
  if (batteryIntent && slots.battery_symptom !== "unknown") {
    evidenceItems.push({
      grade: "OBSERVED",
      text: `Owner-described cranking symptom: ${slots.battery_symptom}`,
    });
  } else if (batteryIntent) {
    evidenceItems.push({
      grade: "UNVERIFIED",
      text: "Start/no-start pattern not narrowed (no_crank vs slow_crank vs clicks).",
    });
  }
  if (overheatIntent && slots.steam === "yes") {
    evidenceItems.push({
      grade: "OBSERVED",
      text: "Owner reports steam — treat as high-risk cooling event (no hot-cap DIY).",
    });
  } else if (overheatIntent && slots.temp_gauge_or_light === "yes") {
    evidenceItems.push({
      grade: "REPORTED",
      text: "Owner reports temp gauge/light concern.",
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
      : lightingIntent || batteryIntent || overheatIntent || slots.dtc_list.length
        ? "UNVERIFIED"
        : "INFERRED";

  const seekingRootCause = ROOT_CAUSE_ASK_RE.test(current);
  const missingCritical: IntakeMissingSlot[] = [];

  if (lightingIntent && structure === "unknown") {
    missingCritical.push("lighting_structure");
    if (slots.housing_confirm === "unset") missingCritical.push("housing_confirm");
  }

  if (batteryIntent) {
    if (slots.battery_symptom === "unknown") missingCritical.push("battery_symptom");
    if (slots.lights_dim === "unknown") missingCritical.push("lights_dim");
  }

  if (overheatIntent) {
    if (slots.temp_gauge_or_light === "unknown" && slots.steam === "unknown") {
      missingCritical.push("temp_gauge_or_light");
      missingCritical.push("steam");
    } else if (slots.steam === "unknown") {
      missingCritical.push("steam");
    }
    if (slots.level_checked_cold === "unknown" && slots.steam !== "yes") {
      missingCritical.push("level_checked_cold");
    }
  }

  if (
    seekingRootCause &&
    !lightingIntent &&
    !batteryIntent &&
    !overheatIntent &&
    !slots.when_started &&
    slots.sudden_or_gradual === "unknown"
  ) {
    missingCritical.push("when_started");
  }
  if (
    seekingRootCause &&
    !lightingIntent &&
    !batteryIntent &&
    !overheatIntent &&
    slots.intermittent_or_constant === "unknown"
  ) {
    missingCritical.push("intermittent_or_constant");
  }
  if (
    seekingRootCause &&
    !lightingIntent &&
    !batteryIntent &&
    !overheatIntent &&
    slots.side === "unknown" &&
    /\b(light|lamp|side|mirror|wheel|brake|turn)\b/i.test(blob)
  ) {
    missingCritical.push("side");
  }

  const focusIntent: IntakeFocusIntent = lightingIntent
    ? "lighting"
    : batteryIntent
      ? "battery_cranking"
      : overheatIntent
        ? "overheat"
        : seekingRootCause
          ? "generic_root_cause"
          : "none";

  const preferIntakeQuestions =
    missingCritical.length > 0 &&
    (lightingIntent ||
      batteryIntent ||
      overheatIntent ||
      seekingRootCause) &&
    missingCritical.slice(0, 2).length > 0;

  return {
    slots,
    missingCritical: missingCritical.slice(0, 2),
    evidenceItems,
    focusIntent,
    lightingIntent,
    batteryIntent,
    overheatIntent,
    seekingRootCause,
    preferIntakeQuestions,
  };
}

/** Chip labels for missing slots (en-US). */
export function intakeChipPrompts(
  missing: IntakeMissingSlot[],
  opts?: {
    lightingIntent?: boolean;
    batteryIntent?: boolean;
    overheatIntent?: boolean;
  },
): string[] {
  const chips: string[] = [];
  const lightingIntent = opts?.lightingIntent ?? false;
  const batteryIntent = opts?.batteryIntent ?? false;
  const overheatIntent = opts?.overheatIntent ?? false;

  for (const m of missing) {
    if (m === "lighting_structure" || m === "housing_confirm") {
      chips.push("Dust cap I can unscrew");
      chips.push("Sealed / heatsink LED module");
      continue;
    }
    if (m === "battery_symptom") {
      chips.push("No crank at all");
      chips.push("Slow crank / clicks");
      continue;
    }
    if (m === "lights_dim") chips.push("Lights are dim");
    if (m === "temp_gauge_or_light") chips.push("Gauge in red / temp light");
    if (m === "steam") chips.push("Seeing steam");
    if (m === "level_checked_cold") chips.push("Checked level only when cold");
    if (m === "when_started") chips.push("Started suddenly");
    if (m === "intermittent_or_constant") chips.push("It comes and goes");
    if (m === "side") chips.push("Left side only");
  }
  if (lightingIntent && !chips.some((c) => /dust|sealed/i.test(c))) {
    chips.unshift("Dust cap vs sealed module?");
  }
  if (batteryIntent && !chips.some((c) => /crank|dim/i.test(c))) {
    chips.unshift("No crank vs slow crank?");
  }
  if (overheatIntent && !chips.some((c) => /steam|gauge|cold/i.test(c))) {
    chips.unshift("Gauge in red?");
  }
  return [...new Set(chips)].slice(0, 4);
}
