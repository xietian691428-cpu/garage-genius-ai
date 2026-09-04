import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { estimateAiCostUsd, inferAiProvider } from "@/lib/ai-cost/prices";
import { PLAN_AI_LIMITS } from "@/lib/ai-cost/plan-limits";
import {
  allowModelCalls,
  evaluateAiSpendGate,
  formatLimitedQuotaReply,
  LIMITED_QUOTA_PREFIX,
} from "@/lib/ai-cost/gate";
import { isAiCostHardCapEnabled } from "@/lib/ai-cost/config";
import { PLAN_ENTITLEMENTS } from "@/lib/types/subscription";
import { formatAiHttpError } from "@/lib/format-ai-http-error";
import { utcMonthBounds } from "@/lib/ai-cost/period";
import { shopReportMonthBoundsUtc } from "@/lib/shop-report-limits";

describe("AI cost standards", () => {
  it("keeps paid AI budgets near 30% of monthly list price", () => {
    expect(PLAN_AI_LIMITS.free.aiBudgetUsd).toBe(0.25);
    expect(PLAN_AI_LIMITS.free.visionCallsPerPeriod).toBe(3);
    expect(PLAN_AI_LIMITS.pro.aiBudgetUsd).toBe(3);
    expect(PLAN_AI_LIMITS.pro.visionCallsPerPeriod).toBe(30);
    expect(PLAN_AI_LIMITS.pro_heavy.aiBudgetUsd).toBe(6.5);
    expect(PLAN_AI_LIMITS.pro_heavy.visionCallsPerPeriod).toBe(80);

    expect(PLAN_AI_LIMITS.pro.aiBudgetUsd / PLAN_ENTITLEMENTS.pro.priceMonthly).toBeLessThan(0.35);
    expect(
      PLAN_AI_LIMITS.pro_heavy.aiBudgetUsd / PLAN_ENTITLEMENTS.pro_heavy.priceMonthly,
    ).toBeLessThan(0.35);
  });

  it("aligns catalog copy with vision caps (no unlimited photos)", () => {
    expect(PLAN_ENTITLEMENTS.free.visionCallsPerMonth).toBe(3);
    expect(PLAN_ENTITLEMENTS.pro.visionCallsPerMonth).toBe(30);
    expect(PLAN_ENTITLEMENTS.pro_heavy.visionCallsPerMonth).toBe(80);
    expect(PLAN_ENTITLEMENTS.free.features.join(" ")).toMatch(/3 photo analyses \/ month/);
    expect(PLAN_ENTITLEMENTS.pro.features.join(" ")).toMatch(/30 photo analyses \/ month/);
    expect(PLAN_ENTITLEMENTS.pro_heavy.features.join(" ")).toMatch(
      /80 photo analyses \/ month/,
    );
    expect(PLAN_ENTITLEMENTS.pro.features.join(" ")).not.toMatch(/unlimited photo/i);
  });

  it("applies a Kimi per-call floor so tiny token counts still cost", () => {
    const cheap = estimateAiCostUsd({
      provider: "kimi",
      model: "kimi-k3",
      promptTokens: 10,
      completionTokens: 20,
    });
    expect(cheap).toBe(0.012);
    expect(inferAiProvider("kimi-k3")).toBe("kimi");
    expect(inferAiProvider("deepseek-chat")).toBe("deepseek");
  });

  it("meters DeepSeek below the Kimi floor", () => {
    const cost = estimateAiCostUsd({
      provider: "deepseek",
      model: "deepseek-chat",
      promptTokens: 1_000,
      completionTokens: 500,
    });
    expect(cost).toBeGreaterThan(0);
    expect(cost).toBeLessThan(0.012);
  });
});

describe("AI spend gate", () => {
  it("blocks Free after 3 vision calls", () => {
    const d = evaluateAiSpendGate({
      plan: "free",
      spentUsd: 0.01,
      visionUsed: 3,
      needsVision: true,
    });
    expect(d.ok).toBe(false);
    if (!d.ok) {
      expect(d.status).toBe(429);
      expect(d.code).toBe("vision_quota_exceeded");
      expect(d.limited).toBe(true);
      expect(d.remaining).toBe(0);
      expect(d.message).toMatch(/Upgrade to Pro/);
      expect(allowModelCalls(d)).toBe(false);
    }
  });

  it("allows text chat when vision is exhausted", () => {
    const d = evaluateAiSpendGate({
      plan: "free",
      spentUsd: 0.01,
      visionUsed: 3,
      needsVision: false,
    });
    expect(d.ok).toBe(true);
  });

  it("blocks when USD budget is spent", () => {
    const d = evaluateAiSpendGate({
      plan: "pro",
      spentUsd: 3,
      visionUsed: 0,
      needsVision: false,
    });
    expect(d.ok).toBe(false);
    if (!d.ok) {
      expect(d.status).toBe(402);
      expect(d.code).toBe("ai_budget_exceeded");
      expect(d.limited).toBe(true);
      expect(d.remaining).toBe(0);
      expect(allowModelCalls(d)).toBe(false);
    }
  });
});

describe("AI_COST_HARD_CAP default", () => {
  const prev = process.env.AI_COST_HARD_CAP;
  const prevVercel = process.env.VERCEL_ENV;

  afterEach(() => {
    if (prev === undefined) delete process.env.AI_COST_HARD_CAP;
    else process.env.AI_COST_HARD_CAP = prev;
    if (prevVercel === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = prevVercel;
  });

  it("is on by default and in production", () => {
    delete process.env.AI_COST_HARD_CAP;
    process.env.VERCEL_ENV = "production";
    expect(isAiCostHardCapEnabled()).toBe(true);
  });

  it("can be turned off with AI_COST_HARD_CAP=0", () => {
    process.env.VERCEL_ENV = "production";
    process.env.AI_COST_HARD_CAP = "0";
    expect(isAiCostHardCapEnabled()).toBe(false);
  });
});

describe("budget / vision HTTP copy", () => {
  it("surfaces upgrade text for 402 ai_budget_exceeded", () => {
    expect(
      formatAiHttpError({
        status: 402,
        code: "ai_budget_exceeded",
        error: "This month's AI allowance ($0.25 on Free) is used up.",
      }),
    ).toMatch(/allowance/i);
    expect(
      formatAiHttpError({
        status: 402,
        code: "ai_budget_exceeded",
        error: "This month's AI allowance ($0.25 on Free) is used up.",
      }),
    ).toMatch(/LIMITED \/ quota exceeded/);
  });

  it("does not treat vision quota as a generic 429 wait message", () => {
    expect(
      formatAiHttpError({
        status: 429,
        code: "vision_quota_exceeded",
        error:
          "You've used this month's 3 photo analyses on Free. Upgrade to Pro for 30 photo analyses / month.",
      }),
    ).toMatch(/Upgrade to Pro/);
  });

  it("marks leftover quota copy as limited / quota exceeded", () => {
    const marked = formatLimitedQuotaReply(
      "This month's AI allowance ($0.25 on Free) is used up.",
    );
    expect(marked).toContain(LIMITED_QUOTA_PREFIX);
    expect(marked).toMatch(/not a full coaching reply/i);
    expect(formatLimitedQuotaReply(marked)).toBe(marked);
  });

  it("chat spend gate runs before Kimi and DeepSeek", () => {
    const src = readFileSync("app/api/chat/route.ts", "utf8");
    const gate = src.indexOf("await assertAiSpendGate");
    const kimi = src.indexOf("analyzeChatImage(");
    const chat = src.indexOf("await callChatWithOptionalVision");
    expect(gate).toBeGreaterThan(-1);
    expect(kimi).toBeGreaterThan(-1);
    expect(chat).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(kimi);
    expect(gate).toBeLessThan(chat);
  });
});

describe("UTC month bounds match shop-report period", () => {
  it("shares the same start/end ISO", () => {
    const d = new Date("2026-09-03T08:00:00.000Z");
    expect(utcMonthBounds(d)).toEqual(shopReportMonthBoundsUtc(d));
  });
});
