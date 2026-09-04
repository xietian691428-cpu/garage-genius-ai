import { describe, expect, it } from "vitest";
import { needsUtcMonthReset } from "@/lib/token-service";
import {
  TOKEN_PLAN_LIMITS,
  tokenPercentLeft,
  tokenPercentUsed,
} from "@/lib/types/tokens";
import { PLAN_ENTITLEMENTS } from "@/lib/types/subscription";
import { formatAiHttpError } from "@/lib/format-ai-http-error";
import { AI_RATE_LIMITS } from "@/lib/ai-abuse";
import { upgradeCopy } from "@/lib/upgrade-copy";

describe("UTC calendar-month token reset", () => {
  it("does not reset within the same UTC month", () => {
    const now = new Date("2026-08-31T23:00:00.000Z");
    expect(needsUtcMonthReset("2026-08-01T00:00:00.000Z", now)).toBe(false);
    expect(needsUtcMonthReset("2026-08-15T12:00:00.000Z", now)).toBe(false);
  });

  it("resets on the next UTC month, including year wrap", () => {
    expect(
      needsUtcMonthReset(
        "2026-07-31T23:59:59.000Z",
        new Date("2026-08-01T00:00:00.000Z"),
      ),
    ).toBe(true);
    expect(
      needsUtcMonthReset(
        "2025-12-15T00:00:00.000Z",
        new Date("2026-01-01T00:00:00.000Z"),
      ),
    ).toBe(true);
  });

  it("treats invalid reset dates as needing a reset", () => {
    expect(needsUtcMonthReset("not-a-date", new Date("2026-08-13T00:00:00.000Z"))).toBe(
      true,
    );
  });
});

describe("token percent display", () => {
  it("treats unlimited as 100% left (never a fake used bar)", () => {
    expect(
      tokenPercentLeft({ unlimited: true, used: 149_000, includedMonthly: 150_000 }),
    ).toBe(100);
  });

  it("mirrors used vs remaining for metered plans", () => {
    expect(tokenPercentUsed(0, 15_000)).toBe(0);
    expect(tokenPercentLeft({ used: 0, includedMonthly: 15_000 })).toBe(100);
    expect(tokenPercentUsed(7_500, 15_000)).toBe(50);
    expect(tokenPercentLeft({ used: 7_500, includedMonthly: 15_000 })).toBe(50);
    expect(tokenPercentUsed(15_000, 15_000)).toBe(100);
    expect(tokenPercentLeft({ used: 15_000, includedMonthly: 15_000 })).toBe(0);
  });
});

describe("plan catalog vs token limits", () => {
  it("keeps subscription includedTokens aligned with TOKEN_PLAN_LIMITS", () => {
    expect(PLAN_ENTITLEMENTS.free.includedTokens).toBe(
      TOKEN_PLAN_LIMITS.free.includedMonthly,
    );
    expect(PLAN_ENTITLEMENTS.pro.includedTokens).toBe(
      TOKEN_PLAN_LIMITS.pro.includedMonthly,
    );
    expect(PLAN_ENTITLEMENTS.pro_heavy.includedTokens).toBe(
      TOKEN_PLAN_LIMITS.pro_heavy.includedMonthly,
    );
    expect(TOKEN_PLAN_LIMITS.free.includedMonthly).toBe(15_000);
    expect(TOKEN_PLAN_LIMITS.pro.includedMonthly).toBe(150_000);
    expect(TOKEN_PLAN_LIMITS.pro_heavy.includedMonthly).toBe(400_000);
  });

  it("keeps photo caps aligned with PLAN_AI_LIMITS", async () => {
    const { PLAN_AI_LIMITS } = await import("@/lib/ai-cost/plan-limits");
    expect(PLAN_ENTITLEMENTS.free.visionCallsPerMonth).toBe(
      PLAN_AI_LIMITS.free.visionCallsPerPeriod,
    );
    expect(PLAN_ENTITLEMENTS.pro.visionCallsPerMonth).toBe(
      PLAN_AI_LIMITS.pro.visionCallsPerPeriod,
    );
    expect(PLAN_ENTITLEMENTS.pro_heavy.visionCallsPerMonth).toBe(
      PLAN_AI_LIMITS.pro_heavy.visionCallsPerPeriod,
    );
    expect(PLAN_AI_LIMITS.free.visionCallsPerPeriod).toBe(3);
    expect(PLAN_AI_LIMITS.pro.visionCallsPerPeriod).toBe(30);
    expect(PLAN_AI_LIMITS.pro_heavy.visionCallsPerPeriod).toBe(80);
  });

  it("feature lists keep P0 photo caps and education-only US copy", () => {
    const blob = [
      ...PLAN_ENTITLEMENTS.free.features,
      ...PLAN_ENTITLEMENTS.pro.features,
    ].join(" ");
    expect(blob).toMatch(/3 photo analyses \/ month/);
    expect(blob).toMatch(/30 photo analyses \/ month/);
    expect(blob).toMatch(/VIN decode/);
    expect(blob).toMatch(/recall education/i);
    expect(blob).toMatch(/code coaching/i);
    expect(blob).not.toMatch(/guaranteed fix|cure|diagnosis guaranteed/i);
  });

  it("upgrade copy stays on P0 photo quota and education language", () => {
    const photo = upgradeCopy("photo");
    expect(photo.message).toMatch(/3 photo analyses \/ month/);
    expect(photo.message).toMatch(/Pro includes 30/);
    expect(photo.bullets.join(" ")).toMatch(/VIN decode/);
    expect(photo.bullets.join(" ")).toMatch(/code coaching/i);
    expect(photo.bullets.join(" ")).not.toMatch(/guaranteed fix/i);
    expect(upgradeCopy("generic").message).not.toMatch(/guaranteed repair|cured/i);
  });

  it("keeps hourly/daily AI rate limits above token floors", () => {
    expect(AI_RATE_LIMITS.free.perHour).toBeGreaterThan(0);
    expect(AI_RATE_LIMITS.pro.perDay).toBeGreaterThan(AI_RATE_LIMITS.free.perDay);
  });
});

describe("token 402 copy", () => {
  it("surfaces remaining-quota server text", () => {
    expect(
      formatAiHttpError({
        status: 402,
        code: "insufficient_tokens",
        error: "Insufficient tokens. Remaining this month: 1429. Plan: pro.",
      }),
    ).toMatch(/Remaining this month: 1429/);
  });

  it("falls back when the server omitted a message", () => {
    expect(
      formatAiHttpError({
        status: 402,
        code: "insufficient_tokens",
        error: "",
      }),
    ).toMatch(/Insufficient tokens/i);
  });
});
