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
  });
});

describe("vehicle plan limits", () => {
  it("matches PLAN_ENTITLEMENTS maxVehicles", () => {
    expect(maxVehiclesForTier("free")).toBe(1);
    expect(maxVehiclesForTier("pro")).toBe(5);
    expect(maxVehiclesForTier("pro_heavy")).toBe(10);
  });
});
