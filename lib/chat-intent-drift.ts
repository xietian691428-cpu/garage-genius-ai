/**
 * Multi-turn intent reset + focus summary for Chat.
 *
 * Inserted after vehicle gate (client) + language lock + safety-topics,
 * before DeepSeek. Does not touch CoachScenarioPlayer or mix vehicles.
 *
 * Optimizations vs a second LLM extractor:
 * - Summary is deterministic (same language as the user message).
 * - On hard reset, drop prior assistant turns — keeping the last assistant
 *   is what caused oil-change bleed into parking-brake / roll-away replies.
 * - Persist last focuses per vehicle_id in localStorage (chat is already
 *   isolated that way). No Redis / extra session table.
 */

import { detectReplyLanguageHint, type ReplyLanguageHint } from "@/lib/reply-language";
import {
  matchSafetyTopicIds,
  parkingBrakeFaultMatches,
  parkingBrakeNegationMatches,
} from "@/lib/safety-topics";

export type DriftReason =
  | "new_high_risk"
  | "topic_shift"
  | "explicit_new_issue"
  | "none";

export type ParkingBrakeState =
  | "unknown"
  | "ok"
  | "set"
  | "not_holding"
  | "failed";

export type TurnFocus = {
  summary: string;
  topics: string[];
  entities: string[];
  isHighRisk: boolean;
  turnIndex: number;
  createdAt: string;
  /** User (or inherited prior turn) said the vehicle is already raised. */
  vehicleRaised?: boolean;
  parkingBrakeState?: ParkingBrakeState;
};

export type DriftCheckResult = {
  shouldReset: boolean;
  reason: DriftReason;
  currentFocus: TurnFocus;
  previousFocus?: TurnFocus;
};

/** Safety topic ids that force a conversation reset when newly introduced. */
export const DRIFT_CRITICAL_TOPICS = [
  "airbag_srs",
  "high_voltage_ev",
  "exhaust_co",
  "brakes",
  "lifting_under_car",
] as const;

const GENERIC_ENTITY_IDS = new Set([
  "car",
  "vehicle",
  "truck",
  "camry",
  "toyota",
]);

/**
 * Optional DeepSeek extractor prompt (not used by default — extra latency /
 * tokens). Kept so a later CHAT_FOCUS_SUMMARY_LLM path can reuse it.
 */
export const FOCUS_SUMMARY_SYSTEM_PROMPT = `You are a concise automotive dialogue focus extractor for Garage Genius AI.
Output ONE short sentence (max 22 words) describing the user's CURRENT primary concern.
Rules:
- Use the same language as the user message.
- Focus only on the latest user message.
- Include critical safety context if present (e.g. vehicle on jack stands, parking brake not holding).
- Do NOT give advice, diagnosis, or next steps.
- Do NOT mention previous topics unless the user explicitly links them.
Output format: plain text only, no quotes, no prefix.`;

type EntityDef = { id: string; aliases: string[] };

/** Longer aliases first at match time so "jack stands" wins over "jack". */
const ENTITY_DEFS: EntityDef[] = [
  {
    id: "parking_brake",
    aliases: [
      "electronic parking brake",
      "freno de estacionamiento",
      "parking brake shoes",
      "parking brake",
      "park brake",
      "hand brake",
      "freno de mano",
      "handbrake",
      "e-brake",
      "驻车制动",
      "电子手刹",
      "手刹蹄片",
      "手刹",
      "epb",
    ],
  },
  {
    id: "brake_shoes",
    aliases: [
      "parking brake shoes",
      "brake shoes",
      "zapatas del freno de mano",
      "手刹蹄片",
      "蹄片",
    ],
  },
  {
    id: "jack_stands",
    aliases: [
      "jack stands",
      "axle stands",
      "jack stand",
      "soportes de gato",
      "千斤顶支架",
      "支架顶车",
    ],
  },
  {
    id: "jack",
    aliases: ["floor jack", "jack the", "jack up", "千斤顶", "顶车", "jack"],
  },
  {
    id: "oil",
    aliases: [
      "oil change",
      "drain plug",
      "oil drain",
      "oil filter",
      "jack points",
      "engine oil",
      "换机油",
      "放油螺丝",
      "机油滤芯",
      "机油滤",
      "机油",
      "aceite de motor",
    ],
  },
  {
    id: "cabin_filter",
    aliases: ["cabin filter", "pollen filter", "空调滤芯", "空调滤清器"],
  },
  {
    id: "brake_pads",
    aliases: ["brake pads", "brake pad", "刹车片", "pastillas"],
  },
  {
    id: "rotors",
    aliases: ["brake rotors", "brake rotor", "刹车盘"],
  },
  {
    id: "o2_sensor",
    aliases: ["oxygen sensor", "o2 sensor", "o2", "氧传感器"],
  },
  {
    id: "coil",
    aliases: ["ignition coil", "点火线圈"],
  },
  {
    id: "spark_plug",
    aliases: ["spark plugs", "spark plug", "火花塞"],
  },
  {
    id: "coolant",
    aliases: ["coolant", "radiator", "冷却液", "水箱"],
  },
  {
    id: "battery",
    aliases: ["12v battery", "battery", "电瓶", "蓄电池"],
  },
  {
    id: "tire",
    aliases: ["tire", "tyre", "轮胎"],
  },
  {
    id: "airbag",
    aliases: ["airbag", "srs", "安全气囊", "气囊"],
  },
  {
    id: "exhaust",
    aliases: ["carbon monoxide", "exhaust", "一氧化碳", "排气"],
  },
  {
    id: "hv_battery",
    aliases: ["high voltage", "orange cable", "高压", "橙色线"],
  },
];

const ENTITY_STALE_PHRASES: Record<string, string[]> = {
  oil: [
    "oil change",
    "drain plug",
    "oil drain",
    "oil filter",
    "engine oil",
    "continue with the oil",
    "next, remove the drain",
    "front jack points",
    "front jack point",
    "jack points",
    "jack the front",
    "换机油",
    "放油螺丝",
    "机油滤",
    "aceite de motor",
    "前顶车点",
    "前部顶车",
  ],
  jack: [
    "front jack points",
    "front jack point",
    "jack points",
    "front jack",
    "jack the front",
    "前顶车点",
    "前部顶车",
  ],
  cabin_filter: ["cabin filter", "空调滤芯"],
  brake_pads: ["brake pads", "pad thickness", "刹车片"],
  brake_shoes: ["brake shoes", "手刹蹄片"],
  rotors: ["brake rotor", "刹车盘"],
  o2_sensor: ["o2 sensor", "oxygen sensor", "氧传感器"],
  coil: ["ignition coil", "点火线圈"],
  spark_plug: ["spark plug", "火花塞"],
  coolant: ["coolant flush", "radiator cap", "冷却液"],
};

/** Explicit topic-change cues — avoid bald "instead" / "另外" (too common in DIY steps). */
const EXPLICIT_NEW_ISSUE = [
  "new issue",
  "new question",
  "ask a new question",
  "different problem",
  "another problem",
  "different issue",
  "another issue",
  "unrelated problem",
  "unrelated issue",
  "switch to",
  "now about",
  "新问题",
  "换一个问题",
  "另外一个问题",
  "现在是另一个",
  "无关的问题",
  "otro problema",
  "un problema distinto",
  "ahora sobre",
];

const ALIAS_INDEX = ENTITY_DEFS.flatMap((def) =>
  def.aliases.map((alias) => ({ id: def.id, alias: alias.toLowerCase() })),
).sort((a, b) => b.alias.length - a.alias.length);

export function isChatDriftDebugEnabled(): boolean {
  return process.env.NEXT_PUBLIC_CHAT_DRIFT_DEBUG === "1";
}

export function logChatDrift(
  payload: Record<string, unknown>,
  vehicleId?: string | null,
): void {
  if (!isChatDriftDebugEnabled()) return;
  console.debug("[chat-drift]", {
    vehicleId: vehicleId || undefined,
    ...payload,
  });
}

export function messagePlainText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      const p = part as { type?: string; text?: string };
      return p.type === "text" && typeof p.text === "string" ? p.text : "";
    })
    .filter(Boolean)
    .join("\n");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function haystackContainsAlias(haystack: string, alias: string): boolean {
  if (/[\u3400-\u9fff]/.test(alias) || alias.includes(" ")) {
    return haystack.includes(alias);
  }
  if (alias.length <= 4) {
    return new RegExp(`\\b${escapeRegExp(alias)}\\b`, "i").test(haystack);
  }
  return haystack.includes(alias);
}

export function extractKeyEntities(text: string): string[] {
  let hay = (text || "").toLowerCase();
  if (!hay.trim()) return [];
  const found: string[] = [];
  for (const { id, alias } of ALIAS_INDEX) {
    if (!haystackContainsAlias(hay, alias)) continue;
    if (!found.includes(id)) found.push(id);
    hay = hay.split(alias).join(" ");
  }
  return found;
}

/** Already up on stands — not future-tense "I'll jack it". */
const VEHICLE_RAISED_CUES = [
  "on jack stands",
  "on the jack stands",
  "on axle stands",
  "already raised",
  "already up on",
  "still on stands",
  "still on the stands",
  "already had the front on",
  "car is on stands",
  "vehicle is on stands",
  "up on jack stands",
  "up on stands",
  "en el gato",
  "en los soportes",
  "sobre soportes",
  "sobre los soportes",
  "ya elevado",
  "ya está en el gato",
  "ya esta en el gato",
  "con el gato puesto",
  "puesto en el gato",
  "sobre el gato",
  "en soportes de gato",
  "已经顶起来",
  "已经顶起",
  "已经顶了",
  "在架子上",
  "在支架上",
  "顶起来了",
  "车已经顶",
];

const VEHICLE_LOWERED_CUES = [
  "lowered the car",
  "lowered the vehicle",
  "off the stands",
  "off jack stands",
  "took it down",
  "back on the ground",
  "放下来了",
  "已经落地",
  "放下车子",
  "bajé el coche",
  "ya está en el suelo",
];

const FAULT_CUES = [
  "won't hold",
  "will not hold",
  "not holding",
  "not working",
  "doesn't work",
  "does not work",
  "failed to hold",
  "creeps forward",
  "car rolled",
  "rolled forward",
  "rolled a bit",
  "rolled a little",
  "worn shoes",
  "shoes are worn",
  "shoes worn",
  "不持力",
  "拉不住",
  "溜车",
  "溜了",
  "溜了一点",
  "磨损",
  "还是会动",
  "no sujeta",
  "no funciona",
  "zapatas gastadas",
];

export function detectVehicleRaised(text: string): boolean {
  const hay = (text || "").toLowerCase();
  return VEHICLE_RAISED_CUES.some((c) => hay.includes(c.toLowerCase()));
}

export function detectVehicleLowered(text: string): boolean {
  const hay = (text || "").toLowerCase();
  return VEHICLE_LOWERED_CUES.some((c) => hay.includes(c.toLowerCase()));
}

export function hasFaultCue(text: string): boolean {
  const hay = (text || "").toLowerCase();
  if (FAULT_CUES.some((c) => hay.includes(c.toLowerCase()))) return true;
  return parkingBrakeFaultMatches(text);
}

export function inferVehicleRaised(
  userMessage: string,
  previous: TurnFocus | null | undefined,
): boolean {
  if (detectVehicleLowered(userMessage)) return false;
  if (detectVehicleRaised(userMessage)) return true;
  if (previous?.vehicleRaised) return true;
  // Prior turn was jacking — treat as maybe still raised on the next concern.
  if (
    previous &&
    (previous.entities.includes("jack_stands") ||
      previous.entities.includes("jack"))
  ) {
    return true;
  }
  return false;
}

function hasParkingBrakeFaultCue(userMessage: string): boolean {
  const hay = (userMessage || "").toLowerCase();
  return (
    parkingBrakeFaultMatches(userMessage) ||
    /won't hold|will not hold|not holding|不持力|拉不住|溜车|溜了/.test(hay)
  );
}

/**
 * Parking-brake slot on TurnFocus. Called from buildTurnFocus.
 *
 * Do not treat `currentSafetyTopics.includes("brakes")` as a parking-brake
 * fault — that fires on service-brake text (行车制动绵) and would undo
 * “手刹没事”.
 *
 * Negation returns `ok`, not `set`: `set` means the user engaged the brake
 * for DIY (oil/jack). `unknown` would drop the explicit clear and let
 * summaries fall back to inherited not_holding phrasing.
 */
export function updateParkingBrakeState(
  userMessage: string,
  prevState: ParkingBrakeState | undefined,
  _currentSafetyTopics: string[],
): ParkingBrakeState {
  const fault = hasParkingBrakeFaultCue(userMessage);
  const negated = parkingBrakeNegationMatches(userMessage);
  const hay = (userMessage || "").toLowerCase();

  // 1. Explicit “parking brake is fine” / 手刹没事 — clear not_holding.
  //    Same-turn fault still wins (“fine most days but it won't hold”).
  if (negated && !fault) return "ok";

  // 2. Parking-brake fault phrases (not generic brakes topic).
  if (fault) {
    if (/failed to hold|has failed|坏了|actuator failed/.test(hay)) {
      return "failed";
    }
    return "not_holding";
  }

  // 3. DIY “set / engage the parking brake” (oil change, jacking).
  if (
    /set the parking brake|parking brake (?:is |was )?on|engage(?:d)? the (?:parking brake|handbrake)|拉(?:上)?手刹|拉驻车/.test(
      hay,
    )
  ) {
    return "set";
  }

  // 4. Otherwise inherit.
  return prevState && prevState !== "unknown" ? prevState : "unknown";
}

export function inferParkingBrakeState(
  userMessage: string,
  previous: TurnFocus | null | undefined,
  currentSafetyTopics?: string[],
): ParkingBrakeState {
  return updateParkingBrakeState(
    userMessage,
    previous?.parkingBrakeState,
    currentSafetyTopics ?? matchDriftSafetyTopics(userMessage),
  );
}

type PrimaryJob =
  | "parking_brake"
  | "brakes"
  | "oil"
  | "lifting"
  | "cabin_filter"
  | "other";

function inferPrimaryJob(
  entities: string[],
  topics: string[],
  text: string,
  pbState?: ParkingBrakeState,
): PrimaryJob | null {
  const pbIssue =
    pbState !== "ok" &&
    (pbState === "not_holding" ||
      pbState === "failed" ||
      parkingBrakeFaultMatches(text) ||
      (entities.includes("parking_brake") && hasFaultCue(text)));
  if (pbIssue || (entities.includes("brake_shoes") && pbState !== "ok")) {
    return "parking_brake";
  }
  if (
    topics.includes("brakes") ||
    entities.includes("brake_pads") ||
    entities.includes("rotors")
  ) {
    return "brakes";
  }
  if (entities.includes("oil")) return "oil";
  if (entities.includes("cabin_filter")) return "cabin_filter";
  if (
    topics.includes("lifting_under_car") ||
    entities.includes("jack_stands") ||
    entities.includes("jack")
  ) {
    return "lifting";
  }
  if (entities.length) return "other";
  return null;
}

export const CRITICAL_RAISED_STATE_PROMPT = `[CRITICAL STATE] Vehicle may already be raised. Do not assume previous chocking or parking brake is still valid. Prioritize getting clear of under the vehicle if it is moving.
If this [CRITICAL STATE] is present AND the current issue involves brakes / parking brake:
- Do NOT suggest continuing previous service steps (oil change, drain plug, oil filter, front jack points).
- Do NOT assume previous chocking is still valid.
- First priority: confirm the vehicle is stable, or get clear from underneath if it is moving.`;

export function needsCriticalRaisedState(focus: TurnFocus): boolean {
  if (!focus.vehicleRaised) return false;
  const pbBad =
    focus.parkingBrakeState === "not_holding" ||
    focus.parkingBrakeState === "failed";
  const brakesOrPb =
    focus.topics.includes("brakes") ||
    pbBad ||
    focus.entities.includes("parking_brake");
  return brakesOrPb;
}

export function matchDriftSafetyTopics(userMessage: string): string[] {
  return matchSafetyTopicIds(userMessage, {
    max: 8,
    userText: userMessage,
  });
}

function isHighRiskTopics(topics: string[]): boolean {
  return topics.some((t) =>
    (DRIFT_CRITICAL_TOPICS as readonly string[]).includes(t),
  );
}

function clipSummary(text: string, lang: ReplyLanguageHint): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  if (lang === "zh") {
    return cleaned.length > 36 ? `${cleaned.slice(0, 36)}…` : cleaned;
  }
  const words = cleaned.split(" ");
  if (words.length <= 22) return cleaned;
  return `${words.slice(0, 22).join(" ")}…`;
}

/** Rule-based focus line — follows HARD LANGUAGE LOCK, no extra DeepSeek call. */
export function composeFocusSummary(input: {
  userMessage: string;
  topics: string[];
  entities: string[];
  language?: ReplyLanguageHint;
  vehicleRaised?: boolean;
  parkingBrakeState?: ParkingBrakeState;
}): string {
  const lang =
    input.language ?? detectReplyLanguageHint(input.userMessage);
  const e = new Set(input.entities);
  const raised = Boolean(input.vehicleRaised);
  const pbBad =
    input.parkingBrakeState === "not_holding" ||
    input.parkingBrakeState === "failed";
  const pbCleared = input.parkingBrakeState === "ok";
  const pbIssue =
    !pbCleared &&
    (pbBad ||
      (e.has("parking_brake") &&
        (input.topics.includes("brakes") ||
          parkingBrakeFaultMatches(input.userMessage))));

  if (lang === "zh") {
    if (pbIssue && raised) {
      return "手刹不持力；车辆可能仍在千斤顶支架上。";
    }
    if (pbIssue) return "手刹/驻车制动不持力或无法正常工作。";
    if (pbBad && (e.has("jack") || input.topics.includes("lifting_under_car"))) {
      return "手刹可能不持力；顶车前先塞轮掩，未稳定勿上车底。";
    }
    if (e.has("brake_pads") || input.topics.includes("brakes")) {
      return "行车制动（刹车片/制动系统）问题。";
    }
    if (e.has("oil") && !raised) return "换机油 / 放油相关。";
    if (e.has("oil") && raised) return "换机油；车辆可能已顶起。";
    if (e.has("jack_stands") || input.topics.includes("lifting_under_car") || raised) {
      return "顶车或车下作业；不要只靠千斤顶。";
    }
  } else if (lang === "es") {
    if (pbIssue && raised) {
      return "El freno de mano no sujeta; el vehículo puede seguir sobre soportes.";
    }
    if (pbIssue) {
      return "El freno de estacionamiento no sujeta o no funciona.";
    }
    if (e.has("brake_pads") || input.topics.includes("brakes")) {
      return "Freno de servicio (pastillas / sistema de frenado).";
    }
    if (e.has("oil")) return "Cambio de aceite / tapón de drenaje.";
    if (e.has("jack_stands") || input.topics.includes("lifting_under_car") || raised) {
      return "Elevación / trabajo bajo el vehículo; no confiar solo en el gato.";
    }
  } else {
    if (pbIssue && raised) {
      return "Parking brake not holding; vehicle may still be on jack stands.";
    }
    if (pbIssue) {
      return "Parking brake not holding or not working as expected.";
    }
    if (pbBad && (e.has("jack") || input.topics.includes("lifting_under_car"))) {
      return "Parking brake may not hold; chock before raising and stay out until stable.";
    }
    if (e.has("brake_pads") || input.topics.includes("brakes")) {
      return "Service-brake concern (pads, stopping power, or related).";
    }
    if (e.has("oil") && raised) {
      return "Oil change; vehicle may already be raised on stands.";
    }
    if (e.has("oil")) return "Oil change / drain-plug service.";
    if (e.has("jack_stands") || input.topics.includes("lifting_under_car") || raised) {
      return "Vehicle lifting / working under the car; do not rely on a jack alone.";
    }
    if (e.has("airbag") || input.topics.includes("airbag_srs")) {
      return "Airbag / SRS concern — high-risk.";
    }
    if (e.has("hv_battery") || input.topics.includes("high_voltage_ev")) {
      return "High-voltage hybrid/EV concern — high-risk.";
    }
  }

  const first = (input.userMessage || "").split(/[.!?。！？]/)[0] || input.userMessage;
  return clipSummary(first, lang);
}

export function isTurnFocus(value: unknown): value is TurnFocus {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.summary === "string" &&
    Array.isArray(v.topics) &&
    Array.isArray(v.entities) &&
    typeof v.isHighRisk === "boolean" &&
    typeof v.turnIndex === "number"
  );
}

export function parseTurnFocus(value: unknown): TurnFocus | null {
  if (!isTurnFocus(value)) return null;
  const raw = value as TurnFocus & Record<string, unknown>;
  const pb = raw.parkingBrakeState;
  const parkingBrakeState: ParkingBrakeState =
    pb === "ok" ||
    pb === "set" ||
    pb === "not_holding" ||
    pb === "failed" ||
    pb === "unknown"
      ? pb
      : "unknown";
  return {
    summary: value.summary,
    topics: value.topics.filter((t): t is string => typeof t === "string"),
    entities: value.entities.filter((t): t is string => typeof t === "string"),
    isHighRisk: value.isHighRisk,
    turnIndex: value.turnIndex,
    createdAt:
      typeof value.createdAt === "string"
        ? value.createdAt
        : new Date().toISOString(),
    vehicleRaised: Boolean(raw.vehicleRaised),
    parkingBrakeState,
  };
}

export function buildTurnFocus(
  userMessage: string,
  turnIndex: number,
  topics = matchDriftSafetyTopics(userMessage),
  previous?: TurnFocus | null,
): TurnFocus {
  const entities = extractKeyEntities(userMessage);
  const vehicleRaised = inferVehicleRaised(userMessage, previous);
  const parkingBrakeState = updateParkingBrakeState(
    userMessage,
    previous?.parkingBrakeState,
    topics,
  );
  return {
    summary: composeFocusSummary({
      userMessage,
      topics,
      entities,
      vehicleRaised,
      parkingBrakeState,
    }),
    topics,
    entities,
    isHighRisk: isHighRiskTopics(topics),
    turnIndex,
    createdAt: new Date().toISOString(),
    vehicleRaised,
    parkingBrakeState,
  };
}

function hasExplicitNewIssue(normalized: string): boolean {
  return EXPLICIT_NEW_ISSUE.some((p) => normalized.includes(p));
}

function hasNewCritical(
  currentTopics: string[],
  previousTopics: string[] | undefined,
): boolean {
  const prev = previousTopics ?? [];
  return currentTopics.some(
    (t) =>
      (DRIFT_CRITICAL_TOPICS as readonly string[]).includes(t) &&
      !prev.includes(t),
  );
}

function hasEntityShift(
  current: string[],
  previous: string[] | undefined,
): boolean {
  if (!previous || current.length === 0) return false;
  const overlap = current.filter((e) => previous.includes(e));
  if (overlap.length > 0) return false;
  return current.some((e) => !GENERIC_ENTITY_IDS.has(e));
}

export function detectIntentDrift(
  userMessage: string,
  history: Array<{ role?: string; content?: unknown }>,
  previousFocus: TurnFocus | null,
  currentSafetyTopics: string[],
): DriftCheckResult {
  const normalized = (userMessage || "").toLowerCase();
  const explicitNewIssue = hasExplicitNewIssue(normalized);
  const newCritical = hasNewCritical(
    currentSafetyTopics,
    previousFocus?.topics,
  );
  const currentEntities = extractKeyEntities(userMessage);
  const entityShift = hasEntityShift(currentEntities, previousFocus?.entities);
  const faultCue = hasFaultCue(userMessage);
  const currentPbState = updateParkingBrakeState(
    userMessage,
    previousFocus?.parkingBrakeState,
    currentSafetyTopics,
  );
  const previousJob = previousFocus
    ? inferPrimaryJob(
        previousFocus.entities,
        previousFocus.topics,
        previousFocus.summary,
        previousFocus.parkingBrakeState,
      )
    : null;
  const currentJob = inferPrimaryJob(
    currentEntities,
    currentSafetyTopics,
    userMessage,
    currentPbState,
  );
  const primaryShift =
    Boolean(previousJob && currentJob) &&
    previousJob !== currentJob &&
    previousJob !== "other" &&
    currentJob !== "other" &&
    faultCue;
  const disjointFault = entityShift && faultCue;

  const shouldReset =
    explicitNewIssue ||
    newCritical ||
    (entityShift && currentSafetyTopics.length > 0) ||
    primaryShift ||
    disjointFault;

  const reason: DriftReason = explicitNewIssue
    ? "explicit_new_issue"
    : newCritical
      ? "new_high_risk"
      : entityShift && currentSafetyTopics.length > 0
        ? "topic_shift"
        : primaryShift || disjointFault
          ? "topic_shift"
          : "none";

  const userCount = history.filter((m) => m.role === "user").length;
  let currentFocus = buildTurnFocus(
    userMessage,
    Math.max(0, userCount - 1),
    currentSafetyTopics,
    previousFocus,
  );

  // Weak follow-ups ("ok", "thanks") keep the prior summary so the model
  // stays on the live job without an extra extractor call.
  if (
    !shouldReset &&
    previousFocus &&
    currentFocus.topics.length === 0 &&
    currentFocus.entities.length === 0
  ) {
    currentFocus = {
      ...previousFocus,
      turnIndex: currentFocus.turnIndex,
      createdAt: currentFocus.createdAt,
      vehicleRaised: inferVehicleRaised(userMessage, previousFocus),
      parkingBrakeState: updateParkingBrakeState(
        userMessage,
        previousFocus.parkingBrakeState,
        currentSafetyTopics,
      ),
    };
  }

  return {
    shouldReset,
    reason,
    currentFocus,
    previousFocus: previousFocus ?? undefined,
  };
}

export function isHardReset(drift: DriftCheckResult): boolean {
  return (
    drift.shouldReset &&
    (drift.reason === "new_high_risk" ||
      drift.reason === "explicit_new_issue")
  );
}

export function buildDriftSystemBlock(drift: DriftCheckResult): string {
  const topics = drift.currentFocus.topics;
  const safetyLine = topics.length
    ? `Active safety topics requiring callout: ${topics.join(", ")}.`
    : "";
  const raisedLine = needsCriticalRaisedState(drift.currentFocus)
    ? CRITICAL_RAISED_STATE_PROMPT
    : "";
  const underCarLine =
    topics.includes("lifting_under_car") &&
    (topics.includes("brakes") ||
      drift.currentFocus.parkingBrakeState === "not_holding" ||
      drift.currentFocus.parkingBrakeState === "failed")
      ? "If the vehicle is moving or unstable, get clear from under it before any diagnosis."
      : "";

  const extra = [safetyLine, raisedLine, underCarLine].filter(Boolean).join("\n");

  if (drift.shouldReset) {
    const summary =
      drift.currentFocus.summary || "(see the latest user message)";
    return `## THIS TURN — CONTEXT RESET (required)
The user's current focus has changed. The previous chat topic is inactive unless they explicitly continue it.
Current focus: ${summary}
${extra}
Do NOT continue previous service steps (oil change, drain plug, oil filter, previous jacking points, etc.) unless the user asks.
Ignore the Repair loop instruction to continue the prior diagnosis for this turn — answer from the current focus only.`.trim();
  }

  if (drift.currentFocus.summary) {
    return `## THIS TURN — CURRENT FOCUS
${drift.currentFocus.summary}
${extra}
Stay on this concern. Do not revive an older job unless the user explicitly links it.`.trim();
  }

  return extra;
}

export function lastUserMessage<T extends { role?: string }>(
  messages: T[],
): T | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "user") return messages[i];
  }
  return undefined;
}

/**
 * Hard reset: send only the latest user turn (keeping the last assistant
 * re-injects the abandoned job). topic_shift keeps the client-sliced window.
 */
export function applyHistoryForDrift<T extends { role?: string; id?: string }>(
  messages: T[],
  drift: DriftCheckResult,
  apiHistoryFromId?: string | null,
): T[] {
  let window = messages;
  if (apiHistoryFromId) {
    const start = window.findIndex((m) => m.id === apiHistoryFromId);
    if (start >= 0) window = window.slice(start);
  }
  if (!isHardReset(drift)) return window;
  const latest = lastUserMessage(window);
  return latest ? [latest] : window;
}

function previousUserTexts(
  messages: Array<{ role?: string; content?: unknown }>,
): string[] {
  const texts: string[] = [];
  for (const msg of messages) {
    if (msg.role !== "user") continue;
    const text = messagePlainText(msg.content).trim();
    if (text) texts.push(text);
  }
  // Drop the latest (current) user turn.
  return texts.length > 1 ? texts.slice(0, -1) : [];
}

function preferParkingBrakeState(
  a: ParkingBrakeState | undefined,
  b: ParkingBrakeState | undefined,
): ParkingBrakeState {
  const rank: Record<ParkingBrakeState, number> = {
    failed: 4,
    not_holding: 3,
    set: 2,
    ok: 2,
    unknown: 1,
  };
  const left = a ?? "unknown";
  const right = b ?? "unknown";
  return rank[left] >= rank[right] ? left : right;
}

/**
 * Rebuild a prior TurnFocus when localStorage was cleared.
 * Scan the last 1–2 user turns so vehicleRaised from an oil/jack sentence
 * is not lost if the most recent prior turn is only a parking-brake fault.
 */
export function reconstructFocusFromHistory(
  messages: Array<{ role?: string; content?: unknown }>,
): TurnFocus | null {
  const priors = previousUserTexts(messages);
  if (!priors.length) return null;
  const lastTwo = priors.slice(-2);
  const newest = lastTwo[lastTwo.length - 1];
  const older = lastTwo.length > 1 ? lastTwo[0] : null;
  const olderFocus = older ? buildTurnFocus(older, Math.max(0, priors.length - 2)) : null;
  const newestFocus = buildTurnFocus(
    newest,
    Math.max(0, priors.length - 1),
    matchDriftSafetyTopics(newest),
    olderFocus,
  );
  const scanRaised = lastTwo.some(
    (t) =>
      detectVehicleRaised(t) ||
      extractKeyEntities(t).includes("jack_stands") ||
      extractKeyEntities(t).includes("jack"),
  );
  const scanTopics = [...new Set(lastTwo.flatMap((t) => matchDriftSafetyTopics(t)))];
  const scanEntities = [
    ...new Set(lastTwo.flatMap((t) => extractKeyEntities(t))),
  ];
  const newestTopics = matchDriftSafetyTopics(newest);
  const newestPb = updateParkingBrakeState(
    newest,
    olderFocus?.parkingBrakeState,
    newestTopics,
  );
  const scanPb = lastTwo.reduce<ParkingBrakeState>(
    (acc, t) =>
      preferParkingBrakeState(
        acc,
        updateParkingBrakeState(
          t,
          olderFocus?.parkingBrakeState,
          matchDriftSafetyTopics(t),
        ),
      ),
    newestFocus.parkingBrakeState ?? "unknown",
  );
  // Latest-turn "parking brake is fine" beats an older not_holding scan.
  const parkingBrakeState =
    newestPb === "ok"
      ? "ok"
      : preferParkingBrakeState(newestFocus.parkingBrakeState, scanPb);
  return {
    ...newestFocus,
    vehicleRaised: newestFocus.vehicleRaised || scanRaised,
    parkingBrakeState,
    topics: [...new Set([...newestFocus.topics, ...scanTopics])],
    entities: [...new Set([...newestFocus.entities, ...scanEntities])],
    summary: composeFocusSummary({
      userMessage: newest,
      topics: [...new Set([...newestFocus.topics, ...scanTopics])],
      entities: [...new Set([...newestFocus.entities, ...scanEntities])],
      vehicleRaised: newestFocus.vehicleRaised || scanRaised,
      parkingBrakeState,
    }),
  };
}

export function resolvePreviousFocus(
  messages: Array<{ role?: string; content?: unknown }>,
  stored: TurnFocus | null,
): TurnFocus | null {
  if (stored) return stored;
  return reconstructFocusFromHistory(messages);
}

export function prepareDriftForChatTurn(opts: {
  messages: Array<{ role?: string; content?: unknown }>;
  previousFocus?: unknown;
  vehicleId?: string | null;
  apiHistoryFromId?: string | null;
}): {
  drift: DriftCheckResult;
  conversation: Array<{ role?: string; content?: unknown }>;
  systemBlock: string;
} {
  const stored = parseTurnFocus(opts.previousFocus);
  const previousFocus = resolvePreviousFocus(opts.messages, stored);
  const latest = lastUserMessage(opts.messages);
  const userMessage = latest ? messagePlainText(latest.content) : "";
  const topics = matchDriftSafetyTopics(userMessage);
  const drift = detectIntentDrift(
    userMessage,
    opts.messages,
    previousFocus,
    topics,
  );
  const conversation = applyHistoryForDrift(
    opts.messages,
    drift,
    opts.apiHistoryFromId,
  );
  const systemBlock = buildDriftSystemBlock(drift);

  logChatDrift(
    {
      shouldReset: drift.shouldReset,
      reason: drift.reason,
      summary: drift.currentFocus.summary,
      topics: drift.currentFocus.topics,
      entities: drift.currentFocus.entities,
      vehicleRaised: drift.currentFocus.vehicleRaised ?? false,
      parkingBrakeState: drift.currentFocus.parkingBrakeState ?? "unknown",
      historyKept: conversation.length,
      apiHistoryFromId: opts.apiHistoryFromId || null,
      criticalRaised: needsCriticalRaisedState(drift.currentFocus),
    },
    opts.vehicleId,
  );

  return { drift, conversation, systemBlock };
}

function staleEntities(
  abandoned: TurnFocus,
  current: TurnFocus,
): string[] {
  let stale = abandoned.entities.filter((e) => !current.entities.includes(e));
  // Users often name the old job as context ("from the oil change") without
  // wanting those service steps continued.
  if (
    current.isHighRisk &&
    abandoned.entities.includes("oil") &&
    !stale.includes("oil")
  ) {
    stale.push("oil");
  }
  if (
    current.topics.includes("lifting_under_car") ||
    current.entities.includes("jack_stands") ||
    current.entities.includes("jack")
  ) {
    stale = stale.filter((e) => e !== "jack" && e !== "jack_stands");
  }
  if (current.entities.includes("parking_brake")) {
    stale = stale.filter((e) => e !== "parking_brake");
  }
  return stale;
}

function uniquePhrases(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const p = raw.trim();
    if (!p) continue;
    const key = p.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

function phrasesForEntity(id: string): string[] {
  const extra = ENTITY_STALE_PHRASES[id] ?? [];
  const aliases = ENTITY_DEFS.find((d) => d.id === id)?.aliases ?? [];
  const fromAliases = aliases.filter(
    (a) => /[\u3400-\u9fff]/.test(a) || a.replace(/\s/g, "").length >= 6,
  );
  return uniquePhrases([...extra, ...fromAliases]);
}

export function staleFocusPhrases(
  abandoned: TurnFocus | null | undefined,
  current: TurnFocus,
): string[] {
  if (!abandoned) return [];
  const phrases: string[] = [];
  for (const id of staleEntities(abandoned, current)) {
    phrases.push(...phrasesForEntity(id));
  }
  return uniquePhrases(phrases);
}

export function matchedStalePhrases(
  reply: string,
  abandoned: TurnFocus | null | undefined,
  current: TurnFocus,
): string[] {
  const phrases = staleFocusPhrases(abandoned, current);
  if (!phrases.length) return [];
  const hay = (reply || "").toLowerCase();
  return phrases.filter((p) => hay.includes(p.toLowerCase()));
}

export function assistantContinuesStaleFocus(
  reply: string,
  abandoned: TurnFocus | null | undefined,
  current: TurnFocus,
): boolean {
  return matchedStalePhrases(reply, abandoned, current).length > 0;
}

export function formatStaleFocusRepairPrompt(
  drift: DriftCheckResult,
  abandoned: TurnFocus | null | undefined,
): string {
  const banned = staleFocusPhrases(abandoned, drift.currentFocus);
  const banLine = banned.length
    ? `Do not mention these abandoned-job cues: ${banned.join(", ")}.`
    : "Do not continue the previous service job.";
  return `## STALE-TOPIC REPAIR (required)
Your draft mixed in an older job that is no longer the user's focus.
Current focus: ${drift.currentFocus.summary || "the latest user message"}
${banLine}
${needsCriticalRaisedState(drift.currentFocus) ? `${CRITICAL_RAISED_STATE_PROMPT}\n` : ""}Rewrite the entire reply for the current focus only. Keep HARD LANGUAGE LOCK, current safety warnings, and the liability disclaimer.
Do not mention oil-change steps, drain plugs, oil filters, or previous jacking points unless the user asked.`.trim();
}
