import { describe, expect, it } from "vitest";
import {
  assembleModelUserMessages,
  assertThreadMatchesRequest,
  capAuthoritativeHistory,
  clientTranscriptLooksTampered,
  extractCurrentUserMessage,
  formatThreadTitle,
  shouldForceNewChatThread,
  titleFromFirstUserMessage,
  THREAD_FORBIDDEN_CODE,
  THREAD_VEHICLE_MISMATCH_CODE,
} from "@/lib/chat-history-authority";
import { resolveVehicleThreadIsolation } from "@/lib/chat-vehicle-ownership";

describe("extractCurrentUserMessage", () => {
  it("requires the message field (ignores messages[])", () => {
    expect(extractCurrentUserMessage("how many quarts?")).toBe(
      "how many quarts?",
    );
    expect(extractCurrentUserMessage("")).toBe("");
    expect(extractCurrentUserMessage(undefined)).toBe("");
  });
});

describe("clientTranscriptLooksTampered", () => {
  it("flags multi-turn client messages[] as tampered / ignored", () => {
    expect(
      clientTranscriptLooksTampered({
        message: "Will Putco lights fit?",
        messages: [
          { role: "user", content: "Corolla drain plug" },
          { role: "assistant", content: "On the Corolla…" },
          { role: "user", content: "Will Putco lights fit?" },
        ],
      }),
    ).toBe(true);
  });

  it("is false when messages[] is absent or matches the single turn", () => {
    expect(
      clientTranscriptLooksTampered({
        message: "hi",
        messages: undefined,
      }),
    ).toBe(false);
    expect(
      clientTranscriptLooksTampered({
        message: "hi",
        messages: [{ role: "user", content: "hi" }],
      }),
    ).toBe(false);
  });
});

describe("assertThreadMatchesRequest — 403 ownership lock", () => {
  it("1) wrong / foreign thread owner → 403 THREAD_FORBIDDEN", () => {
    try {
      assertThreadMatchesRequest({
        thread: { user_id: "user-b", vehicle_id: "camry" },
        userId: "user-a",
        vehicleId: "camry",
      });
      expect.fail("expected throw");
    } catch (err) {
      const e = err as { code?: string; status?: number };
      expect(e.code).toBe(THREAD_FORBIDDEN_CODE);
      expect(e.status).toBe(403);
    }
  });

  it("2) thread.vehicle=A + body.vehicleId=B → 403 THREAD_VEHICLE_MISMATCH", () => {
    try {
      assertThreadMatchesRequest({
        thread: { user_id: "user-a", vehicle_id: "camry-1" },
        userId: "user-a",
        vehicleId: "f150-1",
      });
      expect.fail("expected throw");
    } catch (err) {
      const e = err as { code?: string; status?: number };
      expect(e.code).toBe(THREAD_VEHICLE_MISMATCH_CODE);
      expect(e.status).toBe(403);
    }
  });

  it("3) user B threadId invoked as user A → 403", () => {
    try {
      assertThreadMatchesRequest({
        thread: { user_id: "user-b", vehicle_id: "shared-looking-camry" },
        userId: "user-a",
        vehicleId: "shared-looking-camry",
      });
      expect.fail("expected throw");
    } catch (err) {
      const e = err as { code?: string; status?: number };
      expect(e.code).toBe(THREAD_FORBIDDEN_CODE);
      expect(e.status).toBe(403);
    }
  });

  it("allows matching user + vehicle", () => {
    expect(() =>
      assertThreadMatchesRequest({
        thread: { user_id: "user-a", vehicle_id: "camry-1" },
        userId: "user-a",
        vehicleId: "camry-1",
      }),
    ).not.toThrow();
  });
});

describe("assembleModelUserMessages / capAuthoritativeHistory", () => {
  it("switch isolation: forceNew keeps only current user turn", () => {
    const out = assembleModelUserMessages({
      prior: [
        { role: "user", content: "Corolla oil change drain plug" },
        { role: "assistant", content: "Locate the Corolla drain plug…" },
      ],
      currentUserContent: "Will Putco lights fit?",
      forceNewThread: true,
    });
    expect(out).toHaveLength(1);
    expect(out.map((m) => m.content).join("\n")).not.toMatch(/Corolla|drain/i);
  });

  it("same-car: DB history + current user (pre-persist helper)", () => {
    const out = assembleModelUserMessages({
      prior: [
        { role: "user", content: "oil change on my Camry" },
        { role: "assistant", content: "Warm the engine first…" },
      ],
      currentUserContent: "what about the filter?",
      forceNewThread: false,
    });
    expect(out).toHaveLength(3);
    expect(out[1].role).toBe("assistant");
  });

  it("post-persist load already includes current user — cap only", () => {
    const fromDb = [
      { role: "user" as const, content: "oil change on my Camry" },
      { role: "assistant" as const, content: "Warm the engine first…" },
      { role: "user" as const, content: "what about the filter?" },
    ];
    const capped = capAuthoritativeHistory(fromDb);
    expect(capped).toHaveLength(3);
    expect(capped[2].content).toMatch(/filter/);
  });

  it("4) client body messages[] with old-car drain plug never enters model history", () => {
    // /api/chat ignores messages[]; assembly uses DB prior only (empty here).
    const forgedClientMessages = [
      { role: "user" as const, content: "2019 Corolla oil change drain plug" },
      { role: "assistant" as const, content: "Locate the Corolla drain plug…" },
      { role: "user" as const, content: "low beam out, what should I check?" },
    ];
    expect(
      clientTranscriptLooksTampered({
        message: "low beam out, what should I check?",
        messages: forgedClientMessages,
      }),
    ).toBe(true);
    const out = assembleModelUserMessages({
      prior: [], // authoritative DB for new/empty thread
      currentUserContent: extractCurrentUserMessage(
        "low beam out, what should I check?",
      ),
      forceNewThread: false,
    });
    const blob = out.map((m) => m.content).join("\n");
    expect(blob).toMatch(/low beam/i);
    expect(blob).not.toMatch(/drain plug|Corolla oil/i);
    expect(out).toHaveLength(1);
  });
});

describe("shouldForceNewChatThread", () => {
  it("forces on reset flags / vehicle id change; not on same car", () => {
    expect(
      shouldForceNewChatThread({ vehicleThreadReset: true, currentVehicleId: "b" }),
    ).toBe(true);
    expect(
      shouldForceNewChatThread({
        previousVehicleId: "a",
        currentVehicleId: "b",
      }),
    ).toBe(true);
    expect(
      shouldForceNewChatThread({
        previousVehicleId: "camry-a",
        currentVehicleId: "camry-a",
      }),
    ).toBe(false);
  });
});

describe("switch isolation parity", () => {
  it("A→B: assembled model window has no Corolla drain narrative", () => {
    const polluted = [
      { role: "user", content: "2019 Corolla oil change drain plug" },
      { role: "assistant", content: "Drain the Corolla oil pan…" },
      { role: "user", content: "Will Putco lights fit?" },
    ];
    const isolation = resolveVehicleThreadIsolation({
      vehicleThreadReset: true,
      previousVehicleId: "corolla-1",
      currentVehicleId: "camry-1",
      messages: polluted,
      currentVehicle: { make: "Toyota", model: "Camry" },
    });
    expect(isolation.reset).toBe(true);
    const assembled = assembleModelUserMessages({
      prior: [], // new thread → empty DB
      currentUserContent: extractCurrentUserMessage("Will Putco lights fit?"),
      forceNewThread: true,
    });
    expect(assembled).toHaveLength(1);
    expect(assembled[0].content).toMatch(/Putco/);
    expect(assembled.map((m) => m.content).join("\n")).not.toMatch(/Corolla/i);
  });
});

describe("same-vehicle multi-topic threads", () => {
  it("New topic: empty prior DB → model history is only this turn (no drain plug)", () => {
    const assembled = assembleModelUserMessages({
      prior: [], // sibling thread has zero messages
      currentUserContent: "low beam out, what should I check?",
      forceNewThread: true,
    });
    expect(assembled).toHaveLength(1);
    expect(assembled[0].content).toMatch(/low beam/i);
    expect(assembled.map((m) => m.content).join("\n")).not.toMatch(
      /drain|oil change/i,
    );
  });

  it("switch back to Topic A: DB prior for that thread_id keeps oil context", () => {
    const topicAFromDb = [
      { role: "user" as const, content: "Camry oil change — drain plug size?" },
      {
        role: "assistant" as const,
        content: "Warm the engine, then locate the drain plug…",
      },
      { role: "user" as const, content: "and the filter?" },
    ];
    const capped = capAuthoritativeHistory(topicAFromDb);
    expect(capped.map((m) => m.content).join("\n")).toMatch(/drain plug/i);
    expect(capped.map((m) => m.content).join("\n")).not.toMatch(/low beam/i);
  });

  it("forged other-user threadId → 403", () => {
    try {
      assertThreadMatchesRequest({
        thread: { user_id: "attacker", vehicle_id: "camry-1" },
        userId: "owner",
        vehicleId: "camry-1",
      });
      expect.fail("expected throw");
    } catch (err) {
      const e = err as { code?: string; status?: number };
      expect(e.code).toBe(THREAD_FORBIDDEN_CODE);
      expect(e.status).toBe(403);
    }
  });

  it("cross-vehicle threadId on same account → 403 (Camry thread on F-150)", () => {
    try {
      assertThreadMatchesRequest({
        thread: { user_id: "owner", vehicle_id: "camry-1" },
        userId: "owner",
        vehicleId: "f150-1",
      });
      expect.fail("expected throw");
    } catch (err) {
      const e = err as { code?: string; status?: number };
      expect(e.code).toBe(THREAD_VEHICLE_MISMATCH_CODE);
      expect(e.status).toBe(403);
    }
  });

  it("title helpers truncate first user line", () => {
    expect(titleFromFirstUserMessage("oil change steps for my Camry")).toMatch(
      /oil change/i,
    );
    expect(formatThreadTitle(null, "2026-03-15T12:00:00.000Z")).toMatch(
      /Topic ·/,
    );
  });
});
