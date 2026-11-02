import { describe, expect, it } from "vitest";
import {
  bindChatVehicleIdentity,
  bindConversationFocusToVehicle,
  historyConflictsWithVehicleAnchor,
  isolateMessagesForVehicleThreadReset,
  isVehicleThreadReset,
  resolveVehicleThreadIsolation,
  vehicleSelectionMismatch,
} from "@/lib/chat-vehicle-ownership";
import { nextChatFocusStore } from "@/lib/chat-focus-storage";
import {
  prepareDriftForChatTurn,
  type DriftCheckResult,
  type TurnFocus,
} from "@/lib/chat-intent-drift";
import { trimMessagesForApi } from "@/lib/chat-repair-loop";
import { buildChatSystemPrompt } from "@/lib/chat-system-prompt";
import { formatGarageVehicleAnchor } from "@/lib/vehicle-data/anchors";
import {
  detectSpokenVehicleConflict,
  formatSpokenVehicleConflictPrompt,
  formatVehicleIdentityPrompt,
} from "@/lib/vehicle-data/ymm-conflict";
import type { ChatMessage } from "@/lib/types/chat";
import type { VehicleInfo } from "@/lib/types/chat";

function v(
  partial: Partial<VehicleInfo> & Pick<VehicleInfo, "id" | "year" | "make" | "model">,
): VehicleInfo {
  return {
    name: partial.name ?? `${partial.make} ${partial.model}`,
    mileage: 10000,
    engine: "2.0L",
    ...partial,
  };
}

describe("vehicleSelectionMismatch", () => {
  it("is false when either id is missing (legacy clients)", () => {
    expect(vehicleSelectionMismatch(undefined, "a")).toBe(false);
    expect(vehicleSelectionMismatch("a", undefined)).toBe(false);
  });

  it("is true when header and request vehicle_id differ", () => {
    expect(vehicleSelectionMismatch("camry-a", "camry-b")).toBe(true);
    expect(vehicleSelectionMismatch("camry-a", "camry-a")).toBe(false);
  });
});

describe("bindChatVehicleIdentity", () => {
  it("uses the owned garage row for YMM and mileage so a spoofed client payload cannot switch cars", () => {
    const client = v({
      id: "camry-a",
      year: 2018,
      make: "Honda",
      model: "Civic",
      mileage: 999999,
      notes: "client note",
    });
    const owned = v({
      id: "camry-a",
      year: 2021,
      make: "Toyota",
      model: "Camry",
      mileage: 42000,
      notes: "garage note",
      market: "US",
    });
    const bound = bindChatVehicleIdentity(client, owned);
    expect(bound.year).toBe(2021);
    expect(bound.make).toBe("Toyota");
    expect(bound.model).toBe("Camry");
    expect(bound.mileage).toBe(42000);
    expect(bound.notes).toBe("garage note");
  });
});

describe("bindConversationFocusToVehicle", () => {
  it("drops previous/abandoned focus when vehicle_id does not match", () => {
    const previous: TurnFocus = {
      summary: "Oil change on the F-150 at 120,000 miles",
      topics: [],
      entities: ["oil"],
      isHighRisk: false,
      turnIndex: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const bound = bindConversationFocusToVehicle(
      {
        vehicleId: "f150-1",
        previous,
        abandoned: previous,
        apiHistoryFromId: "old-msg",
      },
      "camry-a",
    );
    expect(bound?.previous).toBeNull();
    expect(bound?.abandoned).toBeNull();
    expect(bound?.apiHistoryFromId).toBeNull();
    expect(bound?.vehicleId).toBe("camry-a");
  });

  it("keeps focus when vehicle_id matches", () => {
    const previous: TurnFocus = {
      summary: "P0420 on the Camry",
      topics: [],
      entities: [],
      isHighRisk: false,
      turnIndex: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const bound = bindConversationFocusToVehicle(
      { vehicleId: "camry-a", previous, apiHistoryFromId: "u-1" },
      "camry-a",
    );
    expect(bound?.previous?.summary).toMatch(/P0420/);
    expect(bound?.apiHistoryFromId).toBe("u-1");
  });

  it("drops focus when vehicleId is missing on the payload (untrusted)", () => {
    const previous: TurnFocus = {
      summary: "Already on jack stands mid oil change",
      topics: ["lifting_under_car"],
      entities: ["jack_stands", "oil"],
      isHighRisk: true,
      vehicleRaised: true,
      parkingBrakeState: "not_holding",
      turnIndex: 2,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const bound = bindConversationFocusToVehicle(
      { previous, abandoned: previous, apiHistoryFromId: "camry-msg" },
      "bmw-1",
    );
    expect(bound?.previous).toBeNull();
    expect(bound?.abandoned).toBeNull();
    expect(bound?.apiHistoryFromId).toBeNull();
    expect(bound?.vehicleId).toBe("bmw-1");
  });
});

describe("isolateMessagesForVehicleThreadReset", () => {
  it("keeps only the latest user turn when vehicleThreadReset is set", () => {
    const msgs = [
      { role: "user", content: "oil change on Corolla" },
      { role: "assistant", content: "drain plug steps…" },
      { role: "user", content: "Will Putco lights fit my truck?" },
    ];
    const out = isolateMessagesForVehicleThreadReset(msgs, true);
    expect(out).toHaveLength(1);
    expect(out[0].content).toMatch(/Putco/);
  });

  it("passes messages through when reset is false", () => {
    const msgs = [
      { role: "user", content: "a" },
      { role: "assistant", content: "b" },
    ];
    expect(isolateMessagesForVehicleThreadReset(msgs, false)).toEqual(msgs);
  });

  it("isVehicleThreadReset accepts vehicleChanged alias", () => {
    expect(isVehicleThreadReset({ vehicleThreadReset: true })).toBe(true);
    expect(isVehicleThreadReset({ vehicleChanged: true })).toBe(true);
    expect(isVehicleThreadReset({ vehicleThreadReset: false })).toBe(false);
    expect(isVehicleThreadReset({})).toBe(false);
  });
});

describe("resolveVehicleThreadIsolation (A→B hard isolation)", () => {
  const corolla = v({
    id: "corolla-1",
    year: 2019,
    make: "Toyota",
    model: "Corolla",
    mileage: 88000,
  });
  const f150 = v({
    id: "f150-1",
    year: 2021,
    make: "Ford",
    model: "F-150",
    mileage: 42000,
  });
  const camryA = v({
    id: "camry-a",
    year: 2020,
    make: "Toyota",
    model: "Camry",
    mileage: 31000,
  });
  const camryB = v({
    id: "camry-b",
    year: 2020,
    make: "Toyota",
    model: "Camry",
    mileage: 92000,
  });

  it("A→B: Corolla oil history is stripped; B anchor remains available", () => {
    const polluted = [
      {
        role: "user",
        content: "Corolla oil change — where is the drain plug?",
      },
      {
        role: "assistant",
        content:
          "On the Corolla, locate the drain plug under the oil pan and replace the oil filter…",
      },
      { role: "user", content: "Will Putco lights fit?" },
    ];
    const isolation = resolveVehicleThreadIsolation({
      vehicleThreadReset: true,
      previousVehicleId: corolla.id,
      currentVehicleId: f150.id,
      messages: polluted,
      currentVehicle: f150,
    });
    expect(isolation.reset).toBe(true);
    const toModel = isolateMessagesForVehicleThreadReset(
      polluted,
      isolation.reset,
    );
    expect(toModel).toHaveLength(1);
    expect(toModel[0].content).toMatch(/Putco/);
    const blob = toModel.map((m) => m.content).join("\n");
    expect(blob).not.toMatch(/Corolla/i);
    expect(blob).not.toMatch(/drain plug/i);
    expect(blob).not.toMatch(/oil filter/i);
    const anchor = formatGarageVehicleAnchor(f150);
    expect(anchor).toContain("[VEHICLE_ANCHOR]");
    expect(anchor).toMatch(/F-150|F150/i);
    expect(anchor).not.toMatch(/Corolla/i);
  });

  it("dirty history alone triggers isolation when client forgets the flag", () => {
    const polluted = [
      { role: "user", content: "2019 Corolla oil change drain plug" },
      {
        role: "assistant",
        content: "Drain the Corolla oil pan, then swap the oil filter.",
      },
      { role: "user", content: "how many quarts?" },
    ];
    expect(
      historyConflictsWithVehicleAnchor(polluted, f150),
    ).toBe(true);
    const isolation = resolveVehicleThreadIsolation({
      messages: polluted,
      currentVehicle: f150,
      currentVehicleId: f150.id,
      previousVehicleId: f150.id, // same id spoof — dirty YMM still isolates
    });
    expect(isolation.reset).toBe(true);
    expect(isolation.reason).toBe("dirty_history");
    const toModel = isolateMessagesForVehicleThreadReset(polluted, true);
    expect(toModel[0].content).toMatch(/quarts/);
    expect(toModel.map((m) => m.content).join("\n")).not.toMatch(/Corolla/i);
  });

  it("twin Camrys different vehicle_id: previousVehicleId forces isolation (mileage not mixed)", () => {
    const history = [
      {
        role: "user",
        content: "Camry at 31,000 miles — oil change?",
      },
      {
        role: "assistant",
        content: "At 31,000 miles on this Camry, follow the interval…",
      },
      { role: "user", content: "how many quarts for this one?" },
    ];
    // Same YMM → dirty detector may not fire; id change must.
    const isolation = resolveVehicleThreadIsolation({
      previousVehicleId: camryA.id,
      currentVehicleId: camryB.id,
      messages: history,
      currentVehicle: camryB,
    });
    expect(isolation.reset).toBe(true);
    expect(isolation.reason).toBe("previous_id");
    const toModel = isolateMessagesForVehicleThreadReset(history, true);
    expect(toModel).toHaveLength(1);
    expect(toModel[0].content).toMatch(/quarts/);
    expect(toModel.map((m) => m.content).join("\n")).not.toMatch(/31,000/);
  });

  it("same vehicle consecutive turns do not clear history", () => {
    const history = [
      { role: "user", content: "oil change on my Camry" },
      { role: "assistant", content: "Warm the engine first…" },
      { role: "user", content: "what about the filter?" },
    ];
    const isolation = resolveVehicleThreadIsolation({
      previousVehicleId: camryA.id,
      currentVehicleId: camryA.id,
      messages: history,
      currentVehicle: camryA,
    });
    expect(isolation.reset).toBe(false);
    expect(isolation.reason).toBeNull();
    const kept = isolateMessagesForVehicleThreadReset(history, false);
    expect(kept).toHaveLength(3);
  });

  it("switch + parking-brake not holding: new car does not inherit vehicleRaised", () => {
    const oldRaised: TurnFocus = {
      summary: "Under Corolla on jack stands; parking brake not holding",
      topics: ["lifting_under_car"],
      entities: ["jack_stands", "parking_brake"],
      isHighRisk: true,
      vehicleRaised: true,
      parkingBrakeState: "not_holding",
      turnIndex: 3,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const focus = bindConversationFocusToVehicle(
      {
        vehicleId: corolla.id,
        previous: oldRaised,
        abandoned: oldRaised,
        apiHistoryFromId: "u-old",
      },
      f150.id,
    );
    expect(focus?.previous).toBeNull();

    const msgs = [{ role: "user", content: "Will Putco lights fit?" }];
    const { drift, conversation } = prepareDriftForChatTurn({
      messages: msgs,
      previousFocus: focus?.previous ?? null,
      vehicleId: f150.id,
      apiHistoryFromId: null,
    });
    expect(conversation).toHaveLength(1);
    expect(drift.currentFocus.vehicleRaised).toBeFalsy();
    expect(drift.currentFocus.parkingBrakeState ?? "unknown").not.toBe(
      "not_holding",
    );
  });

  it("new car inherits raised only when this turn's user says it", () => {
    const msgs = [
      {
        role: "user",
        content:
          "Truck is already on jack stands and the parking brake is not holding — oil filter?",
      },
    ];
    const { drift } = prepareDriftForChatTurn({
      messages: msgs,
      previousFocus: null,
      vehicleId: f150.id,
      apiHistoryFromId: null,
    });
    expect(drift.currentFocus.vehicleRaised).toBe(true);
  });
});

describe("spoken vs archive", () => {
  it("flags my truck on a Corolla garage row", () => {
    const conflict = detectSpokenVehicleConflict(
      { year: 2019, make: "Toyota", model: "Corolla" },
      "Will Putco lights fit my truck?",
    );
    expect(conflict?.kind).toBe("body_class");
    const block = formatSpokenVehicleConflictPrompt(conflict!);
    expect(block).toContain("[SPOKEN_VEHICLE_CONFLICT]");
    expect(block).toMatch(/garage archive/i);
  });

  it("injects spoken conflict into identity prompt", () => {
    const prompt = formatVehicleIdentityPrompt(
      v({ id: "c1", year: 2019, make: "Toyota", model: "Corolla" }),
      "oil for my F-150",
    );
    expect(prompt).toContain("[SPOKEN_VEHICLE_CONFLICT]");
  });
});

describe("vehicle switch API epoch + prompt lock", () => {
  it("trimMessagesForApi + nextChatFocusStore start a new window after switch", () => {
    const history: ChatMessage[] = [
      {
        id: "u-old",
        role: "user",
        content: "Corolla low beam out",
        timestamp: new Date(),
      },
      {
        id: "a-old",
        role: "assistant",
        content: "Confirm dust cap on the Corolla…",
        timestamp: new Date(),
      },
      {
        id: "u-new",
        role: "user",
        content: "Will Putco lights fit my truck?",
        timestamp: new Date(),
      },
    ];
    const payload = trimMessagesForApi(history, undefined, {
      latestUserOnly: true,
    });
    expect(payload).toHaveLength(1);
    expect(payload[0].content).toMatch(/Putco/);
    expect(payload.some((m) => /Corolla/i.test(m.content))).toBe(false);

    const drift: DriftCheckResult = {
      shouldReset: false,
      reason: "continue",
      previousFocus: null,
      currentFocus: {
        summary: "Putco fitment on F-150",
        topics: [],
        entities: [],
        isHighRisk: false,
        turnIndex: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    };
    const next = nextChatFocusStore({
      vehicleId: "f150",
      store: {
        vehicleId: "f150",
        recent: [],
        apiHistoryFromId: null,
        abandonedFocus: null,
      },
      drift,
      latestUserId: "u-new",
      vehicleThreadReset: true,
    });
    expect(next.apiHistoryFromId).toBe("u-new");
    expect(next.abandonedFocus).toBeNull();
    expect(next.recent).toHaveLength(1);
  });

  it("system prompt locks current vehicle and spoken conflict", () => {
    const prompt = buildChatSystemPrompt(
      v({
        id: "f150-1",
        year: 2021,
        make: "Ford",
        model: "F-150",
        market: "US",
      }),
      false,
      null,
      null,
      null,
      null,
      null,
      null,
      "[VEHICLE_ANCHOR]\nYear: 2021 | Make: Ford | Model: F-150",
    );
    expect(prompt.content).toMatch(/Current vehicle only/i);
    expect(prompt.content).toMatch(/SPOKEN_VEHICLE_CONFLICT/);
    expect(prompt.content).toMatch(/different YMM/i);
  });
});
