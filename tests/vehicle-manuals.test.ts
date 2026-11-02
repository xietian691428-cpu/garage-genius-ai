import { beforeEach, describe, expect, it } from "vitest";
import {
  chunkManualPages,
  compareManualYmmToVehicle,
  extractManualSpecAllowlist,
  formatUserManualForPrompt,
  guessYmmFromManualText,
  isManualSearchable,
  isManualSpecQuestion,
  USER_MANUAL_SOURCE_LINE,
  type ManualChunkHit,
} from "@/lib/vehicle-manuals";
import {
  dismissManualNudge,
  dismissManualNudgeNoCopy,
  loadManualNudgeState,
  MANUAL_NUDGE_DISMISS_COOLDOWN_MS,
  MANUAL_NUDGE_NO_MANUAL_COOLDOWN_MS,
  noteNoAnchorSpecReply,
  saveManualNudgeState,
  shouldShowManualNudge,
} from "@/lib/vehicle-manual-nudge";
import en from "@/locales/en-US/common.json";
import es from "@/locales/es/common.json";

describe("private vehicle manuals — isolation & gates", () => {
  it("mismatch without confirm is not searchable", () => {
    expect(
      isManualSearchable({
        status: "ready",
        ymm_match: "mismatch",
        user_confirmed_match: false,
        deleted_at: null,
      }),
    ).toBe(false);
  });

  it("mismatch with confirm is searchable", () => {
    expect(
      isManualSearchable({
        status: "ready",
        ymm_match: "mismatch",
        user_confirmed_match: true,
        deleted_at: null,
      }),
    ).toBe(true);
  });

  it("soft-deleted manuals are never searchable", () => {
    expect(
      isManualSearchable({
        status: "ready",
        ymm_match: "match",
        user_confirmed_match: true,
        deleted_at: "2026-01-01T00:00:00.000Z",
      }),
    ).toBe(false);
  });

  it("YMM compare: Camry manual vs F-150 → mismatch", () => {
    const guess = guessYmmFromManualText(
      "2019 Toyota Camry Owner's Manual\nOil capacity and maintenance…",
    );
    expect(guess.make?.toLowerCase()).toMatch(/toyota/);
    expect(compareManualYmmToVehicle(guess, {
      year: 2021,
      make: "Ford",
      model: "F-150",
    })).toBe("mismatch");
  });

  it("YMM compare: matching Camry → match or unknown (never cross-make match)", () => {
    const guess = { year: 2019, make: "Toyota", model: "Camry" };
    expect(
      compareManualYmmToVehicle(guess, {
        year: 2019,
        make: "Toyota",
        model: "Camry",
      }),
    ).toBe("match");
  });

  it("prompt block cites Your uploaded manual source and never claims OEM certify", () => {
    const hits: ManualChunkHit[] = [
      {
        id: "c1",
        manualId: "m1",
        pageFrom: 12,
        pageTo: 12,
        heading: "Engine oil",
        content: "Engine oil capacity with filter is 4.8 quarts. Use 0W-16.",
        rank: 1,
      },
    ];
    const block = formatUserManualForPrompt(hits);
    expect(block).toMatch(/\[USER_MANUAL/);
    expect(block).toContain(USER_MANUAL_SOURCE_LINE);
    expect(block).toMatch(/not OEM-certified|not OEM-verified/i);
    expect(block).not.toMatch(/knowledge_base|global RAG/i);
  });

  it("spec allowlist extracts qt / viscosity from retrieved chunks only", () => {
    const allow = extractManualSpecAllowlist([
      {
        id: "1",
        manualId: "m",
        pageFrom: 1,
        pageTo: 1,
        heading: null,
        content: "Refill with 4.8 quarts of 0W-16. Drain plug torque 30 ft-lb.",
        rank: 1,
      },
    ]);
    expect(allow.oilCapacity).toMatch(/4\.8/);
    expect(allow.oilViscosity).toMatch(/0\s*w/i);
    expect(allow.torqueSpec).toMatch(/30/);
  });

  it("chunking keeps page ranges and skips tiny pages", () => {
    const chunks = chunkManualPages([
      { page: 1, text: "x" },
      {
        page: 2,
        text: "Engine oil. ".repeat(40) + "Capacity with filter is listed here for DIY.",
      },
    ]);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]?.pageFrom).toBeGreaterThanOrEqual(2);
  });
});

describe("cross-vehicle / cross-user retrieval contract (pure)", () => {
  it("isManualSpecQuestion detects capacity asks", () => {
    expect(isManualSpecQuestion("how many quarts of oil?")).toBe(true);
    expect(isManualSpecQuestion("low beam out")).toBe(false);
  });

  it("searchable gate does not depend on another vehicle id (row is per vehicle)", () => {
    // Retrieval callers must pass user_id+vehicle_id; this unit locks the
    // eligibility predicate that runs *after* that filter.
    const camryReady = isManualSearchable({
      status: "ready",
      ymm_match: "match",
      user_confirmed_match: false,
      deleted_at: null,
    });
    const f150Mismatch = isManualSearchable({
      status: "ready",
      ymm_match: "mismatch",
      user_confirmed_match: false,
      deleted_at: null,
    });
    expect(camryReady).toBe(true);
    expect(f150Mismatch).toBe(false);
  });
});

describe("manual nudge", () => {
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

  it("shows on spec question when no searchable manual", () => {
    expect(
      shouldShowManualNudge({
        vehicleId: "camry",
        hasSearchableManual: false,
        isSpecQuestion: true,
        highRiskStop: false,
        quotaBlocked: false,
      }),
    ).toBe(true);
  });

  it("hides when searchable manual exists or high-risk stop", () => {
    expect(
      shouldShowManualNudge({
        vehicleId: "camry",
        hasSearchableManual: true,
        isSpecQuestion: true,
        highRiskStop: false,
        quotaBlocked: false,
      }),
    ).toBe(false);
    expect(
      shouldShowManualNudge({
        vehicleId: "camry",
        hasSearchableManual: false,
        isSpecQuestion: true,
        highRiskStop: true,
        quotaBlocked: false,
      }),
    ).toBe(false);
  });

  it("Not now cools down for 14 days, then can return", () => {
    dismissManualNudge("camry");
    expect(loadManualNudgeState("camry").dismissedAt).toBeTruthy();
    expect(
      shouldShowManualNudge({
        vehicleId: "camry",
        hasSearchableManual: false,
        isSpecQuestion: true,
        highRiskStop: false,
        quotaBlocked: false,
      }),
    ).toBe(false);
    const after = Date.now() + MANUAL_NUDGE_DISMISS_COOLDOWN_MS + 1_000;
    expect(
      shouldShowManualNudge({
        vehicleId: "camry",
        hasSearchableManual: false,
        isSpecQuestion: true,
        highRiskStop: false,
        quotaBlocked: false,
        now: after,
      }),
    ).toBe(true);
  });

  it("Don't have it cools down for 90 days", () => {
    dismissManualNudgeNoCopy("camry");
    expect(loadManualNudgeState("camry").noManualUntil).toBeTruthy();
    expect(
      shouldShowManualNudge({
        vehicleId: "camry",
        hasSearchableManual: false,
        isSpecQuestion: true,
        highRiskStop: false,
        quotaBlocked: false,
        now: Date.now() + MANUAL_NUDGE_DISMISS_COOLDOWN_MS + 1_000,
      }),
    ).toBe(false);
    expect(
      shouldShowManualNudge({
        vehicleId: "camry",
        hasSearchableManual: false,
        isSpecQuestion: true,
        highRiskStop: false,
        quotaBlocked: false,
        now: Date.now() + MANUAL_NUDGE_NO_MANUAL_COOLDOWN_MS + 1_000,
      }),
    ).toBe(true);
  });

  it("two no-anchor streaks can trigger without a fresh spec ask", () => {
    saveManualNudgeState("camry", {
      dismissedAt: null,
      noManualUntil: null,
      noAnchorSpecStreak: 0,
    });
    noteNoAnchorSpecReply("camry");
    noteNoAnchorSpecReply("camry");
    expect(
      shouldShowManualNudge({
        vehicleId: "camry",
        hasSearchableManual: false,
        isSpecQuestion: false,
        highRiskStop: false,
        quotaBlocked: false,
      }),
    ).toBe(true);
  });
});

describe("manual copy keys (en + es)", () => {
  const enKeys = [
    "manualTitle",
    "manualWhyUpload",
    "manualUploadSubtitle",
    "manualUploadDisclaimer",
    "manualEmpty",
    "manualReady",
    "manualMismatchWarn",
    "manualsSettingsHint",
  ] as const;
  const aiKeys = [
    "manualNudge",
    "manualNudgeUpload",
    "manualNudgeDismiss",
    "manualNudgeNoCopy",
    "manualNudgeNoCopyHint",
  ] as const;

  it("en-US keys exist and stay non-coercive", () => {
    for (const k of enKeys) {
      expect(String((en.vehicles as Record<string, string>)[k]).length).toBeGreaterThan(8);
    }
    for (const k of aiKeys) {
      expect(String((en.ai as Record<string, string>)[k]).length).toBeGreaterThan(2);
    }
    expect(en.vehicles.manualTitle).toMatch(/optional/i);
    expect(en.vehicles.manualWhyUpload).toMatch(/copyright/i);
    expect(en.ai.manualNudge).toMatch(/optional/i);
    expect(en.ai.manualNudge).not.toMatch(/must upload|required to use/i);
    expect(en.ai.manualNudgeNoCopyHint).toMatch(/keep going|under-hood/i);
  });

  it("es keys mirror the same surface", () => {
    for (const k of enKeys) {
      expect(String((es.vehicles as Record<string, string>)[k]).length).toBeGreaterThan(8);
    }
    for (const k of aiKeys) {
      expect(String((es.ai as Record<string, string>)[k]).length).toBeGreaterThan(2);
    }
    expect(es.vehicles.manualTitle).toMatch(/opcional/i);
    expect(es.ai.manualNudgeDismiss).toMatch(/ahora no/i);
  });
});
