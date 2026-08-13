import { describe, expect, it } from "vitest";
import {
  shopReportLimitForPlan,
  shopReportMonthBoundsUtc,
  shopReportPeriodYm,
} from "@/lib/shop-report-limits";
import { maxVehiclesForTier } from "@/lib/vehicle-limits";
import {
  PLAN_ENTITLEMENTS,
  TRIAL_SHOP_REPORTS_PER_MONTH,
} from "@/lib/types/subscription";
import { formatAiHttpError } from "@/lib/format-ai-http-error";
import {
  isTrialWindowExpired,
  resolveSubscription,
} from "@/lib/subscription";

describe("shop report monthly limits", () => {
  it("catalog defaults: Free 3, Pro/Heavy unlimited", () => {
    expect(PLAN_ENTITLEMENTS.free.shopReportsPerMonth).toBe(3);
    expect(PLAN_ENTITLEMENTS.pro.shopReportsPerMonth).toBeNull();
    expect(PLAN_ENTITLEMENTS.pro_heavy.shopReportsPerMonth).toBeNull();
  });

  it("Free limited; Pro unlimited; Trial uses 30", () => {
    expect(shopReportLimitForPlan({ tier: "free", isTrialing: false })).toBe(3);
    expect(shopReportLimitForPlan({ tier: "pro", isTrialing: false })).toBeNull();
    expect(shopReportLimitForPlan({ tier: "pro_heavy", isTrialing: false })).toBeNull();
    expect(shopReportLimitForPlan({ tier: "pro", isTrialing: true })).toBe(
      TRIAL_SHOP_REPORTS_PER_MONTH,
    );
    expect(TRIAL_SHOP_REPORTS_PER_MONTH).toBe(30);
  });

  it("UTC calendar month bounds are exclusive at next month start", () => {
    const d = new Date(Date.UTC(2026, 7, 15, 12, 0, 0)); // Aug 15 2026
    const b = shopReportMonthBoundsUtc(d);
    expect(b.periodYm).toBe("2026-08");
    expect(shopReportPeriodYm(d)).toBe("2026-08");
    expect(b.startIso).toBe("2026-08-01T00:00:00.000Z");
    expect(b.endIso).toBe("2026-09-01T00:00:00.000Z");
  });

  it("formats REPORT_LIMIT_REACHED for UI", () => {
    expect(
      formatAiHttpError({
        status: 402,
        code: "REPORT_LIMIT_REACHED",
        error: "",
      }),
    ).toMatch(/shop report limit/i);
    expect(
      formatAiHttpError({
        status: 402,
        code: "REPORT_LIMIT_REACHED",
        error: "",
        reportLimitFallback: "Alcanzaste el límite mensual de informes.",
      }),
    ).toMatch(/Alcanzaste/);
  });

  it("prefers i18n rate-limit fallback", () => {
    expect(
      formatAiHttpError({
        status: 429,
        code: "RATE_LIMIT",
        error: "",
        rateLimitFallback: "Demasiadas solicitudes. Espera un momento.",
      }),
    ).toMatch(/Demasiadas/);
  });
});

describe("vehicle plan limits", () => {
  it("matches PLAN_ENTITLEMENTS maxVehicles", () => {
    expect(maxVehiclesForTier("free")).toBe(1);
    expect(maxVehiclesForTier("pro")).toBe(5);
    expect(maxVehiclesForTier("pro_heavy")).toBe(10);
  });
});

describe("trial expiry → free entitlements", () => {
  it("future trial_ends_at keeps Pro Trial (5 cars, 30 reports)", () => {
    const ends = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    const r = resolveSubscription({
      subscription_status: "trialing",
      trial_ends_at: ends,
    });
    expect(isTrialWindowExpired({ subscription_status: "trialing", trial_ends_at: ends })).toBe(
      false,
    );
    expect(r.isTrialing).toBe(true);
    expect(r.isPro).toBe(true);
    expect(r.isFree).toBe(false);
    expect(r.entitlements.maxVehicles).toBe(5);
    expect(shopReportLimitForPlan({ tier: r.tier, isTrialing: r.isTrialing })).toBe(30);
  });

  it("past trial_ends_at downgrades to Free (1 car, 3 reports)", () => {
    const ends = new Date(Date.now() - 60_000).toISOString();
    const profile = {
      subscription_status: "trialing" as const,
      trial_ends_at: ends,
    };
    expect(isTrialWindowExpired(profile)).toBe(true);
    const r = resolveSubscription(profile);
    expect(r.isTrialing).toBe(false);
    expect(r.isTrialExpired).toBe(true);
    expect(r.isFree).toBe(true);
    expect(r.isPro).toBe(false);
    expect(r.tier).toBe("free");
    expect(r.status).toBe("free");
    expect(r.label).toBe("Free");
    expect(r.entitlements.maxVehicles).toBe(1);
    expect(r.entitlements.shopReportsPerMonth).toBe(3);
    expect(r.entitlements.voiceEnabled).toBe(false);
    expect(r.entitlements.playbookRunsPerMonth).toBe(5);
    expect(shopReportLimitForPlan({ tier: r.tier, isTrialing: r.isTrialing })).toBe(3);
  });

  it("primary QA email keeps Pro Trial even when trial_ends_at is past", () => {
    const ends = new Date(Date.now() - 60_000).toISOString();
    const profile = {
      email: "18565006079@163.com",
      subscription_status: "trialing" as const,
      trial_ends_at: ends,
    };
    expect(isTrialWindowExpired(profile)).toBe(false);
    const r = resolveSubscription(profile);
    expect(r.isTrialing).toBe(true);
    expect(r.isFree).toBe(false);
    expect(r.isPro).toBe(true);
    expect(r.entitlements.maxVehicles).toBe(5);
    expect(shopReportLimitForPlan({ tier: r.tier, isTrialing: r.isTrialing })).toBe(30);
  });

  it("past_due and canceled resolve to Free entitlements", () => {
    const pastDue = resolveSubscription({
      subscription_status: "past_due",
      trial_ends_at: new Date(Date.now() + 86_400_000).toISOString(),
    });
    expect(pastDue.tier).toBe("free");
    expect(pastDue.isFree).toBe(true);
    expect(pastDue.isPro).toBe(false);
    expect(pastDue.label).toBe("Past due");
    expect(pastDue.entitlements.maxVehicles).toBe(1);
    expect(shopReportLimitForPlan({ tier: pastDue.tier, isTrialing: pastDue.isTrialing })).toBe(3);

    const canceled = resolveSubscription({
      subscription_status: "canceled",
    });
    expect(canceled.tier).toBe("free");
    expect(canceled.isFree).toBe(true);
    expect(canceled.label).toBe("Free");
    expect(canceled.entitlements.shopReportsPerMonth).toBe(3);
  });
});
