import { describe, expect, it, vi } from "vitest";
import {
  aggregateSafetyObserveStats,
  hashUserIdForObserve,
  logSafetyObserveEvent,
  parseSafetyObserveEvents,
  recallDegradedFromAnchorBlock,
  sanitizeSafetyObservePayload,
  safetyEventsMetadata,
} from "@/lib/safety-observe-events";

describe("safety observe events (no PII)", () => {
  it("hashes user ids and never echoes the raw id", () => {
    const a = hashUserIdForObserve("user-uuid-111");
    const b = hashUserIdForObserve("user-uuid-111");
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{12}$/);
    expect(a).not.toContain("user-uuid");
  });

  it("drops VIN, base64 images, and prompt bodies", () => {
    const vin = "4T1C11AK8MU123456";
    const out = sanitizeSafetyObservePayload({
      event: "spec_block",
      vin,
      VIN: vin,
      prompt: "A".repeat(4000),
      messages: [{ role: "user", content: "secret" }],
      image: `data:image/jpeg;base64,${"x".repeat(80)}`,
      images: ["data:image/png;base64,abc"],
      email: "a@b.com",
      route: "chat",
      events: ["drift_reset", "not_a_real_event", "spec_block"],
    });
    expect(JSON.stringify(out)).not.toContain(vin);
    expect(JSON.stringify(out)).not.toMatch(/base64/i);
    expect(out.prompt).toBeUndefined();
    expect(out.messages).toBeUndefined();
    expect(out.email).toBeUndefined();
    expect(out.route).toBe("chat");
    expect(out.events).toEqual(["drift_reset", "spec_block"]);
  });

  it("stamps metadata with event names only", () => {
    expect(safetyEventsMetadata(["spec_block", "spec_block"])).toEqual({
      safetyEvents: ["spec_block"],
    });
    expect(safetyEventsMetadata([])).toEqual({});
    expect(parseSafetyObserveEvents(["ai_budget_exceeded", "nope"])).toEqual([
      "ai_budget_exceeded",
    ]);
  });

  it("flags degraded recall status from ANCHOR_STATUS", () => {
    expect(
      recallDegradedFromAnchorBlock(
        "[ANCHOR_STATUS] vpic=ok recalls=unavailable epa=skipped",
      ),
    ).toBe(true);
    expect(
      recallDegradedFromAnchorBlock(
        "[ANCHOR_STATUS] vpic=none recalls=regional epa=skipped",
      ),
    ).toBe(true);
    expect(
      recallDegradedFromAnchorBlock(
        "[ANCHOR_STATUS] vpic=ok recalls=listed epa=ok",
      ),
    ).toBe(false);
    expect(recallDegradedFromAnchorBlock(null)).toBe(false);
  });

  it("aggregates admin counts without needing row text", () => {
    const stats = aggregateSafetyObserveStats([
      { events: ["drift_reset", "spec_block"] },
      { events: ["spec_block"] },
      { events: [] },
    ]);
    expect(stats.taggedCalls).toBe(2);
    expect(stats.counts.spec_block).toBe(2);
    expect(stats.counts.drift_reset).toBe(1);
  });

  it("logs a compact [safety-observe] line", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    logSafetyObserveEvent(
      "vision_reject",
      { prompt: "do not log me", vin: "4T1C11AK8MU123456" },
      { userId: "abc" },
    );
    expect(spy).toHaveBeenCalled();
    const line = JSON.stringify(spy.mock.calls[0]);
    expect(line).toContain("[safety-observe]");
    expect(line).toContain("vision_reject");
    expect(line).not.toContain("do not log me");
    expect(line).not.toContain("4T1C11AK8MU123456");
    spy.mockRestore();
  });
});
