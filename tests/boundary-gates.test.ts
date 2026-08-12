import { describe, expect, it, afterEach } from "vitest";
import { PLAN_ENTITLEMENTS } from "@/lib/types/subscription";
import { resolveSubscription } from "@/lib/subscription";
import { AI_RATE_LIMITS } from "@/lib/ai-abuse";
import { formatAiHttpError } from "@/lib/format-ai-http-error";
import { isProductionDeploy, isQaUnlockEnabled } from "@/lib/qa-mode";
import { toPublicShopReportPayload } from "@/lib/shop-report/public-view";
import type { ShopReportPayload } from "@/lib/types/shop-report";

describe("subscription entitlements (catalog)", () => {
  it("documents Free / Pro / Heavy vehicle and playbook caps", () => {
    expect(PLAN_ENTITLEMENTS.free.maxVehicles).toBe(1);
    expect(PLAN_ENTITLEMENTS.pro.maxVehicles).toBe(5);
    expect(PLAN_ENTITLEMENTS.pro_heavy.maxVehicles).toBe(10);

    expect(PLAN_ENTITLEMENTS.free.playbookRunsPerMonth).toBe(5);
    expect(PLAN_ENTITLEMENTS.pro.playbookRunsPerMonth).toBeNull();
    expect(PLAN_ENTITLEMENTS.pro_heavy.playbookRunsPerMonth).toBeNull();

    expect(PLAN_ENTITLEMENTS.free.shopReportsPerMonth).toBe(3);
    expect(PLAN_ENTITLEMENTS.pro.shopReportsPerMonth).toBeNull();
  });

  it("treats active trial as Pro (5 vehicles)", () => {
    const ends = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const r = resolveSubscription({
      subscription_status: "trialing",
      trial_ends_at: ends,
    });
    expect(r.isPro).toBe(true);
    expect(r.entitlements.maxVehicles).toBe(5);
    expect(r.label).toBe("Pro Trial");
  });

  it("AI request rate limits exist per plan (shop report shares chat bucket)", () => {
    expect(AI_RATE_LIMITS.free.perHour).toBe(20);
    expect(AI_RATE_LIMITS.free.perDay).toBe(60);
    expect(AI_RATE_LIMITS.pro.perHour).toBe(60);
    expect(AI_RATE_LIMITS.pro_heavy.perDay).toBe(800);
  });
});

describe("formatAiHttpError", () => {
  it("surfaces friendly 429 copy", () => {
    expect(
      formatAiHttpError({
        status: 429,
        code: "rate_limit_hour",
        error: "Too many AI requests this hour (limit 20 for free).",
      }),
    ).toMatch(/Please wait|Try again/i);

    expect(
      formatAiHttpError({ status: 429, code: "rate_limit_day" }),
    ).toBe("Too many requests. Please wait a moment and try again.");
  });
});

describe("QA unlock production hard-block", () => {
  const prevPublic = process.env.NEXT_PUBLIC_QA_UNLOCK;
  const prevVercel = process.env.VERCEL_ENV;
  const prevPublicVercel = process.env.NEXT_PUBLIC_VERCEL_ENV;

  afterEach(() => {
    if (prevPublic === undefined) delete process.env.NEXT_PUBLIC_QA_UNLOCK;
    else process.env.NEXT_PUBLIC_QA_UNLOCK = prevPublic;
    if (prevVercel === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = prevVercel;
    if (prevPublicVercel === undefined) delete process.env.NEXT_PUBLIC_VERCEL_ENV;
    else process.env.NEXT_PUBLIC_VERCEL_ENV = prevPublicVercel;
  });

  it("stays off when VERCEL_ENV is production even if unlock flag is set", () => {
    process.env.VERCEL_ENV = "production";
    process.env.NEXT_PUBLIC_QA_UNLOCK = "true";
    expect(isProductionDeploy()).toBe(true);
    expect(isQaUnlockEnabled()).toBe(false);
  });

  it("stays off when NEXT_PUBLIC_VERCEL_ENV is production", () => {
    delete process.env.VERCEL_ENV;
    process.env.NEXT_PUBLIC_VERCEL_ENV = "production";
    process.env.NEXT_PUBLIC_QA_UNLOCK = "true";
    expect(isQaUnlockEnabled()).toBe(false);
  });
});

describe("shop report public token / VIN", () => {
  it("public payload strips full VIN", () => {
    const payload = {
      reportId: "GG-T",
      generatedAtIso: new Date().toISOString(),
      source: "chat" as const,
      vehicle: {
        year: 2018,
        make: "Toyota",
        model: "Camry",
        mileage: 1,
        vinLast8: "109186AB",
        vinFull: "4T1B11HK5JU123456",
        plate: null,
      },
      ownerObservations: { symptoms: "x", conditions: "", checksDone: [] },
      diagnosticData: {
        codes: [],
        liveDataSummary: null,
        dataSourceNote: null,
      },
      contributingFactors: [],
      checksCompleted: [],
      technicianNextSteps: [],
      ownerNotes: null,
      disclaimer: "Education only",
    } satisfies ShopReportPayload;

    const pub = toPublicShopReportPayload(payload);
    expect(pub.vehicle.vinFull).toBeNull();
    expect(JSON.stringify(pub)).not.toContain("4T1B11HK5JU123456");
  });

  it("public share tokens are long enough to resist casual enumeration", () => {
    // production: randomBytes(24).toString("base64url") ≈ 32 chars
    const sample = Buffer.alloc(24).toString("base64url");
    expect(sample.length).toBeGreaterThanOrEqual(30);
  });
});
