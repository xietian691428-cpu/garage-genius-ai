import { describe, expect, it } from "vitest";
import { trimMessagesForApi } from "@/lib/chat-repair-loop";
import type { ChatMessage } from "@/lib/types/chat";
import {
  applyHistoryForDrift,
  assistantContinuesStaleFocus,
  buildDriftSystemBlock,
  buildTurnFocus,
  composeFocusSummary,
  CRITICAL_RAISED_STATE_PROMPT,
  detectIntentDrift,
  detectVehicleRaised,
  extractKeyEntities,
  isHardReset,
  matchDriftSafetyTopics,
  matchedStalePhrases,
  needsCriticalRaisedState,
  prepareDriftForChatTurn,
  reconstructFocusFromHistory,
  staleFocusPhrases,
} from "@/lib/chat-intent-drift";
import { driftHistoryOptions } from "@/lib/chat-focus-storage";
import type { ChatFocusStore } from "@/lib/chat-focus-storage";

const OIL =
  "DIY oil change on my 2021 Camry. I'll jack the front, set the parking brake, drain plug, new filter.";
const PB =
  "Parking brake won't hold on a slope, car creeps forward even when fully set. I already had the front on jack stands from the oil change.";
const ROLL =
  "The car rolled forward on the jack stands while I was under it.";
const SHOES =
  "During the oil change I noticed the parking brake shoes are worn, should I replace them too?";
const SHOES_ZH = "换油时发现手刹蹄片磨损，要不要一起换";
const PB_ONLY =
  "Parking brake won't hold on a slope, car creeps forward even when fully set.";
const JACK_INSPECT = "Can I jack the front to inspect the parking brake shoes?";
const THANKS = "ok thanks, go ahead";

function msg(
  id: string,
  role: "user" | "assistant",
  content: string,
): ChatMessage {
  return { id, role, content, timestamp: new Date() };
}

describe("extractKeyEntities", () => {
  it("keeps parking_brake distinct from jack stands", () => {
    expect(extractKeyEntities(PB)).toEqual(
      expect.arrayContaining(["parking_brake", "jack_stands"]),
    );
  });

  it("does not treat jack stands as a bare jack-only hit", () => {
    const entities = extractKeyEntities("Use jack stands before crawling under.");
    expect(entities).toContain("jack_stands");
    expect(entities).not.toContain("jack");
  });
});

describe("oil-change → parking-brake fail (Camry script)", () => {
  it("does not treat DIY set-parking-brake + jack as service brakes", () => {
    expect(matchDriftSafetyTopics(OIL)).toEqual(["lifting_under_car"]);
    expect(matchDriftSafetyTopics(OIL)).not.toContain("brakes");
  });

  it("resets on parking-brake fault after oil/jack work", () => {
    const previous = buildTurnFocus(OIL, 0);
    const currentTopics = matchDriftSafetyTopics(PB);
    expect(currentTopics).toEqual(
      expect.arrayContaining(["brakes", "lifting_under_car"]),
    );

    const drift = detectIntentDrift(PB, [{ role: "user", content: OIL }, { role: "user", content: PB }], previous, currentTopics);
    expect(drift.shouldReset).toBe(true);
    expect(drift.reason).toBe("new_high_risk");
    expect(drift.currentFocus.summary.toLowerCase()).toMatch(/parking brake|jack stand/);
    expect(isHardReset(drift)).toBe(true);

    const history = [
      { role: "user" as const, content: OIL },
      { role: "assistant" as const, content: "Next, remove the drain plug and jack the front." },
      { role: "user" as const, content: PB },
    ];
    const kept = applyHistoryForDrift(history, drift);
    expect(kept).toHaveLength(1);
    expect(kept[0].content).toBe(PB);
    expect(JSON.stringify(kept)).not.toMatch(/drain plug/i);
  });

  it("flags oil-change bleed in a parking-brake reply", () => {
    const previous = buildTurnFocus(OIL, 0);
    const current = buildTurnFocus(PB, 1);
    expect(staleFocusPhrases(previous, current).some((p) => /drain plug|oil change/i.test(p))).toBe(true);
    expect(
      assistantContinuesStaleFocus(
        "Continue with the oil change: remove the drain plug, then use the front jack points.",
        previous,
        current,
      ),
    ).toBe(true);
    expect(
      assistantContinuesStaleFocus(
        "Do not get under the car. The parking brake is not holding on the incline.",
        previous,
        current,
      ),
    ).toBe(false);
  });
});

describe("jack-stand roll after parking-brake reset", () => {
  it("keeps the post-reset window instead of reviving the oil thread", () => {
    const pbUser = msg("u-pb", "user", PB);
    const store: ChatFocusStore = {
      vehicleId: "camry-1",
      recent: [buildTurnFocus(PB, 1)],
      apiHistoryFromId: "u-pb",
      abandonedFocus: buildTurnFocus(OIL, 0),
    };
    const drift = detectIntentDrift(
      ROLL,
      [pbUser, msg("a-pb", "assistant", "Chock the wheels."), msg("u-roll", "user", ROLL)],
      store.recent[0],
      matchDriftSafetyTopics(ROLL),
    );
    const opts = driftHistoryOptions(drift, store);
    expect(opts.latestUserOnly).toBe(false);
    expect(opts.fromMessageId).toBe("u-pb");

    const payload = trimMessagesForApi(
      [
        msg("welcome", "assistant", "Hi"),
        msg("u-oil", "user", OIL),
        msg("a-oil", "assistant", "Remove the drain plug next."),
        pbUser,
        msg("a-pb", "assistant", "Do not crawl under the car."),
        msg("u-roll", "user", ROLL),
      ],
      24,
      opts,
    );
    const blob = payload.map((m) => m.content).join("\n");
    expect(blob).toContain(ROLL);
    expect(blob).not.toMatch(/drain plug/i);
    expect(blob).not.toMatch(/DIY oil change/i);
  });
});

describe("detectIntentDrift edge cases", () => {
  it("does not reset a weak follow-up; reuses prior summary", () => {
    const previous = buildTurnFocus(PB, 1);
    const drift = detectIntentDrift(
      THANKS,
      [{ role: "user", content: PB }, { role: "user", content: THANKS }],
      previous,
      matchDriftSafetyTopics(THANKS),
    );
    expect(drift.shouldReset).toBe(false);
    expect(drift.reason).toBe("none");
    expect(drift.currentFocus.summary).toBe(previous.summary);
  });

  it("treats an explicit new-issue phrase as a reset", () => {
    const previous = buildTurnFocus(OIL, 0);
    const next = "New issue: the battery light is on.";
    const drift = detectIntentDrift(
      next,
      [{ role: "user", content: OIL }, { role: "user", content: next }],
      previous,
      matchDriftSafetyTopics(next),
    );
    expect(drift.shouldReset).toBe(true);
    expect(drift.reason).toBe("explicit_new_issue");
  });

  it("does not treat DIY 'instead' as an explicit new issue", () => {
    const previous = buildTurnFocus(OIL, 0);
    const next = "Use jack stands instead of the jack before going under.";
    const drift = detectIntentDrift(
      next,
      [{ role: "user", content: OIL }, { role: "user", content: next }],
      previous,
      matchDriftSafetyTopics(next),
    );
    expect(drift.reason).not.toBe("explicit_new_issue");
  });

  it("resets Chinese 换机油 → 手刹不持力", () => {
    const oilZh = "2021凯美瑞换机油，用千斤顶顶车前部，先拉手刹。";
    const pbZh = "手刹不持力，斜坡上还是会往前溜。";
    const previous = buildTurnFocus(oilZh, 0);
    const drift = detectIntentDrift(
      pbZh,
      [{ role: "user", content: oilZh }, { role: "user", content: pbZh }],
      previous,
      matchDriftSafetyTopics(pbZh),
    );
    expect(drift.shouldReset).toBe(true);
    expect(drift.reason).toBe("new_high_risk");
    expect(drift.currentFocus.summary).toMatch(/手刹/);
  });
});

describe("composeFocusSummary", () => {
  it("follows the user language", () => {
    expect(
      composeFocusSummary({
        userMessage: OIL,
        topics: ["lifting_under_car"],
        entities: extractKeyEntities(OIL),
      }),
    ).toMatch(/Oil change/i);
    expect(
      composeFocusSummary({
        userMessage: PB,
        topics: ["brakes", "lifting_under_car"],
        entities: ["parking_brake", "jack_stands"],
      }),
    ).toMatch(/Parking brake not holding/);
    expect(
      composeFocusSummary({
        userMessage: "手刹不持力，车还在支架上。",
        topics: ["brakes", "lifting_under_car"],
        entities: ["parking_brake", "jack_stands"],
      }),
    ).toMatch(/手刹/);
  });
});

describe("prepareDriftForChatTurn + trimMessagesForApi", () => {
  it("server path drops oil-change assistant on hard reset", () => {
    const { drift, conversation, systemBlock } = prepareDriftForChatTurn({
      messages: [
        { role: "user", content: OIL },
        { role: "assistant", content: "Remove the drain plug at the front jack points." },
        { role: "user", content: PB },
      ],
      previousFocus: buildTurnFocus(OIL, 0),
      vehicleId: "camry-1",
    });
    expect(drift.shouldReset).toBe(true);
    expect(conversation).toHaveLength(1);
    expect(messageContent(conversation[0])).toBe(PB);
    expect(systemBlock).toMatch(/CONTEXT RESET/);
    expect(systemBlock).toMatch(/Ignore the Repair loop instruction/i);
  });

  it("latestUserOnly trim keeps only the current user turn", () => {
    const out = trimMessagesForApi(
      [
        msg("u1", "user", OIL),
        msg("a1", "assistant", "Drain plug next."),
        msg("u2", "user", PB),
      ],
      24,
      { latestUserOnly: true },
    );
    expect(out).toEqual([{ role: "user", content: PB }]);
  });
});

function messageContent(msg: { content?: unknown }): string {
  return typeof msg.content === "string" ? msg.content : "";
}

describe("vehicleRaised + parkingBrakeState", () => {
  it("does not mark future-tense jacking as already raised", () => {
    const oil = buildTurnFocus(OIL, 0);
    expect(oil.vehicleRaised).toBe(false);
    expect(oil.parkingBrakeState).toBe("set");
  });

  it("inherits maybe-raised from a prior jacking turn onto a parking-brake fault", () => {
    const oil = buildTurnFocus(OIL, 0);
    const pb = buildTurnFocus(PB, 1, matchDriftSafetyTopics(PB), oil);
    expect(pb.vehicleRaised).toBe(true);
    expect(pb.parkingBrakeState).toBe("not_holding");
    expect(needsCriticalRaisedState(pb)).toBe(true);
    expect(pb.summary.toLowerCase()).toMatch(/jack stand/);
  });
});

describe("multi-turn high-risk scripts", () => {
  it("oil → parking-brake fail → rolled on stands never sends drain plug / oil filter", () => {
    const oilFocus = buildTurnFocus(OIL, 0);
    const t2 = prepareDriftForChatTurn({
      messages: [
        { role: "user", content: OIL },
        { role: "assistant", content: "Remove the drain plug and oil filter next. Front jack points are behind the subframe." },
        { role: "user", content: PB },
      ],
      previousFocus: oilFocus,
      vehicleId: "camry-1",
    });
    expect(t2.drift.shouldReset).toBe(true);
    expect(t2.conversation).toHaveLength(1);
    expect(JSON.stringify(t2.conversation)).not.toMatch(/drain plug|oil filter|front jack points/i);
    expect(t2.systemBlock).toMatch(/CONTEXT RESET/);
    expect(t2.systemBlock).toMatch(/CRITICAL STATE/);
    expect(t2.systemBlock).toMatch(/get clear from under/i);
    expect(t2.systemBlock).not.toMatch(/continue with the oil/i);

    const pbFocus = t2.drift.currentFocus;
    const t3 = prepareDriftForChatTurn({
      messages: [
        { role: "user", content: PB },
        { role: "assistant", content: "Do not get under the car until it is stable." },
        { role: "user", content: ROLL },
      ],
      previousFocus: pbFocus,
      vehicleId: "camry-1",
      apiHistoryFromId: "u-pb",
    });
    const rollBlob = JSON.stringify(t3.conversation);
    expect(rollBlob).not.toMatch(/drain plug|oil filter/i);
    expect(t3.systemBlock).toMatch(/CRITICAL STATE/);
    expect(t3.systemBlock).toMatch(/get clear from under/i);
    expect(needsCriticalRaisedState(t3.drift.currentFocus)).toBe(true);
  });

  it("oil → worn parking-brake shoes found mid-job is a reset, not continue-the-oil", () => {
    const oilFocus = buildTurnFocus(OIL, 0);
    expect(matchDriftSafetyTopics(SHOES)).toContain("brakes");
    const { drift, conversation, systemBlock } = prepareDriftForChatTurn({
      messages: [
        { role: "user", content: OIL },
        { role: "assistant", content: "Next remove the drain plug and spin off the oil filter." },
        { role: "user", content: SHOES },
      ],
      previousFocus: oilFocus,
      vehicleId: "camry-1",
    });
    expect(drift.shouldReset).toBe(true);
    expect(conversation).toHaveLength(1);
    expect(messageContent(conversation[0])).toBe(SHOES);
    expect(JSON.stringify(conversation)).not.toMatch(/drain plug|oil filter/i);
    expect(systemBlock).toMatch(/Do NOT continue previous service steps/i);

    const zh = prepareDriftForChatTurn({
      messages: [
        { role: "user", content: "2021凯美瑞换机油，用千斤顶顶车前部。" },
        { role: "user", content: SHOES_ZH },
      ],
      previousFocus: buildTurnFocus("2021凯美瑞换机油，用千斤顶顶车前部。", 0),
      vehicleId: "camry-1",
    });
    expect(zh.drift.shouldReset).toBe(true);
    expect(zh.drift.currentFocus.summary).toMatch(/手刹/);
  });

  it("pure parking-brake fault then jacking question inherits not_holding and drops the old reply", () => {
    const pbFocus = buildTurnFocus(PB_ONLY, 0);
    expect(pbFocus.vehicleRaised).toBe(false);
    expect(pbFocus.parkingBrakeState).toBe("not_holding");

    const { drift, conversation, systemBlock } = prepareDriftForChatTurn({
      messages: [
        { role: "user", content: PB_ONLY },
        { role: "assistant", content: "Possible worn shoes or a stretched cable. Next we can talk parts." },
        { role: "user", content: JACK_INSPECT },
      ],
      previousFocus: pbFocus,
      vehicleId: "camry-1",
    });
    expect(drift.shouldReset).toBe(true);
    expect(isHardReset(drift)).toBe(true);
    expect(conversation).toHaveLength(1);
    expect(messageContent(conversation[0])).toBe(JACK_INSPECT);
    expect(drift.currentFocus.parkingBrakeState).toBe("not_holding");
    expect(systemBlock).toMatch(/CONTEXT RESET/);
    expect(systemBlock.toLowerCase()).toMatch(/parking brake|chock|手刹/);
  });
});

describe("repair phrase coverage from abandoned entities", () => {
  it("flags oil filter and front jack points, not only drain plug", () => {
    const previous = buildTurnFocus(OIL, 0);
    const current = buildTurnFocus(PB, 1, matchDriftSafetyTopics(PB), previous);
    const phrases = staleFocusPhrases(previous, current);
    expect(phrases.some((p) => /oil filter/i.test(p))).toBe(true);
    expect(phrases.some((p) => /front jack/i.test(p))).toBe(true);
    expect(phrases.some((p) => /engine oil/i.test(p))).toBe(true);
    expect(
      matchedStalePhrases(
        "Spin off the oil filter, then line up the front jack points.",
        previous,
        current,
      ),
    ).toEqual(expect.arrayContaining(["oil filter", "front jack points"]));
    expect(
      assistantContinuesStaleFocus(
        "Get out from under the car. The parking brake is not holding.",
        previous,
        current,
      ),
    ).toBe(false);
  });
});

describe("mixed-language cues", () => {
  it("detects EN+ZH parking-brake fault while already raised", () => {
    const mixed = "Parking brake 不持力, already on jack stands.";
    const oil = buildTurnFocus(OIL, 0);
    const drift = detectIntentDrift(
      mixed,
      [{ role: "user", content: OIL }, { role: "user", content: mixed }],
      oil,
      matchDriftSafetyTopics(mixed),
    );
    expect(drift.shouldReset).toBe(true);
    expect(drift.currentFocus.vehicleRaised).toBe(true);
    expect(needsCriticalRaisedState(drift.currentFocus)).toBe(true);
    expect(buildDriftSystemBlock(drift)).toMatch(/CRITICAL STATE/);
  });

  it("detects Spanish already-raised variants", () => {
    expect(detectVehicleRaised("El coche ya está en el gato")).toBe(true);
    expect(detectVehicleRaised("Lo dejé con el gato puesto")).toBe(true);
  });
});

describe("focus reconstruction after cache clear", () => {
  it("recovers vehicleRaised from the oil/jack user turn, not only the latest prior", () => {
    const rebuilt = reconstructFocusFromHistory([
      { role: "user", content: OIL },
      { role: "assistant", content: "Jack the front at the factory points." },
      { role: "user", content: PB_ONLY },
      { role: "assistant", content: "Do not get under the car." },
      { role: "user", content: ROLL },
    ]);
    expect(rebuilt).toBeTruthy();
    expect(rebuilt?.vehicleRaised).toBe(true);
    expect(rebuilt?.entities).toEqual(
      expect.arrayContaining(["parking_brake", "jack"]),
    );
  });
});

describe("CRITICAL STATE generation rules", () => {
  it("forbids continuing prior jack/oil steps when raised + brakes", () => {
    expect(CRITICAL_RAISED_STATE_PROMPT).toMatch(/Do NOT suggest continuing previous service steps/i);
    expect(CRITICAL_RAISED_STATE_PROMPT).toMatch(/front jack points/i);
    const oil = buildTurnFocus(OIL, 0);
    const { systemBlock } = prepareDriftForChatTurn({
      messages: [
        { role: "user", content: OIL },
        { role: "user", content: PB },
      ],
      previousFocus: oil,
      vehicleId: "camry-1",
    });
    expect(systemBlock).toMatch(/Do NOT suggest continuing previous service steps/i);
  });
});
