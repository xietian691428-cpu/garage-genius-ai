import { beforeEach, describe, expect, it } from "vitest";
import {
  clearChatFocus,
  loadChatFocus,
  nextChatFocusStore,
  saveChatFocus,
} from "@/lib/chat-focus-storage";
import type { DriftCheckResult } from "@/lib/chat-intent-drift";

const mem: Record<string, string> = {};

beforeEach(() => {
  for (const k of Object.keys(mem)) delete mem[k];
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => mem[k] ?? null,
      setItem: (k: string, v: string) => {
        mem[k] = v;
      },
      removeItem: (k: string) => {
        delete mem[k];
      },
    },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: globalThis,
  });
});

function focus(summary: string): DriftCheckResult["currentFocus"] {
  return {
    summary,
    topics: [],
    entities: [],
    isHighRisk: false,
    vehicleRaised: true,
    parkingBrakeState: "set",
    turnIndex: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("chat focus thread isolation", () => {
  it("New topic thread does not inherit sibling raised / lighting focus", () => {
    const vehicleId = "camry-1";
    const topicA = "thread-oil";
    const topicB = "thread-beam";

    saveChatFocus(
      vehicleId,
      {
        vehicleId,
        threadId: topicA,
        recent: [focus("Camry oil drain plug")],
        apiHistoryFromId: "u1",
        abandonedFocus: null,
      },
      topicA,
    );

    const loadedB = loadChatFocus(vehicleId, topicB);
    expect(loadedB.recent).toEqual([]);
    expect(loadedB.apiHistoryFromId).toBeNull();
    expect(loadedB.abandonedFocus).toBeNull();

    const nextB = nextChatFocusStore({
      vehicleId,
      threadId: topicB,
      store: loadedB,
      drift: {
        shouldReset: false,
        reason: "continue",
        previousFocus: null,
        currentFocus: focus("Camry low beam out"),
      },
      latestUserId: "u-beam",
      newTopic: true,
    });
    expect(nextB.recent).toHaveLength(1);
    expect(nextB.recent[0]?.summary).toMatch(/low beam/i);
    expect(nextB.recent[0]?.summary).not.toMatch(/drain/i);
    expect(nextB.apiHistoryFromId).toBe("u-beam");

    // Sibling A still intact
    const stillA = loadChatFocus(vehicleId, topicA);
    expect(stillA.recent[0]?.summary).toMatch(/drain plug/i);
    expect(stillA.recent[0]?.vehicleRaised).toBe(true);
  });

  it("clearChatFocus only clears the keyed thread", () => {
    const vehicleId = "camry-1";
    saveChatFocus(
      vehicleId,
      {
        vehicleId,
        threadId: "a",
        recent: [focus("oil")],
        apiHistoryFromId: "1",
        abandonedFocus: null,
      },
      "a",
    );
    saveChatFocus(
      vehicleId,
      {
        vehicleId,
        threadId: "b",
        recent: [focus("beam")],
        apiHistoryFromId: "2",
        abandonedFocus: null,
      },
      "b",
    );
    clearChatFocus(vehicleId, "b");
    expect(loadChatFocus(vehicleId, "a").recent[0]?.summary).toMatch(/oil/i);
    expect(loadChatFocus(vehicleId, "b").recent).toEqual([]);
  });
});
