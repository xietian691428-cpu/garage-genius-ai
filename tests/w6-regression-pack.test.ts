import { describe, expect, it } from "vitest";
import { needsExitUnderRepair } from "@/lib/pilot/safety-observe-phrases";
import { inventedSpecFailures } from "@/lib/spec-discipline";
import { applyDiagnosticToneGuards } from "@/lib/diagnostic-tone";
import { shopReportWantsNhtsaRecalls } from "@/lib/shop-report/recalls";
import { formatObdPreferencePromptBlock, parseObdAdapterPreference } from "@/lib/obd-preference";
import { isAiCostHardCapEnabled } from "@/lib/ai-cost/config";
import { evaluateAiSpendGate } from "@/lib/ai-cost/gate";
import { isHighRiskDrivingSituation } from "@/lib/drive-safety";
import { applyInsuranceSafetyGuards } from "@/lib/insurance-coverage-rewrite";
import { resolveChatVehicleGate } from "@/lib/chat-vehicle-gate";
import { isLowTrustAnalysis } from "@/lib/vision/types";
import { flattenShopReportText, applyShopReportToneGuards } from "@/lib/shop-report/sanitize";
import type { ShopReportPayload } from "@/lib/types/shop-report";
import type { VehicleInfo } from "@/lib/types/chat";

/**
 * Thin pack: one assertion per permanent scene so deleting coverage fails CI.
 * Full cases live in the files listed in tests/README.md.
 */
describe("W6 regression pack smoke", () => {
  it("S1 raised + stay-under is still repaired", () => {
    expect(
      needsExitUnderRepair("Stay under and finish the oil.", true),
    ).toBe(true);
    expect(
      needsExitUnderRepair("Stay under and finish the oil.", false, true),
    ).toBe(true);
  });

  it("S2 P0420 Replace-now is rewritten", () => {
    const out = applyDiagnosticToneGuards("P0420: Replace the converter now.");
    expect(out.toLowerCase()).not.toMatch(/replace the converter now/);
  });

  it("S3 US wants NHTSA, EU does not", () => {
    const us: VehicleInfo = {
      id: "v",
      name: "Camry",
      year: 2021,
      make: "Toyota",
      model: "Camry",
      market: "US",
      mileage: 1,
    };
    expect(shopReportWantsNhtsaRecalls(us)).toBe(true);
    expect(shopReportWantsNhtsaRecalls({ ...us, market: "EU" })).toBe(false);
  });

  it("S4 unanchored 4.5 qt is blocked", () => {
    expect(inventedSpecFailures("Fill with 4.5 qt of oil.")).toContain(
      "invented_spec:qt",
    );
  });

  it("S5 empty garage is gated before Chat", () => {
    expect(
      resolveChatVehicleGate({
        text: "oil change",
        garage: [],
        current: null,
        canAddVehicle: true,
        maxVehicles: 1,
      }).code,
    ).toBe("empty_garage");
  });

  it("S6 low-confidence photos are untrusted", () => {
    expect(
      isLowTrustAnalysis({
        condition: "blurry",
        confidence: 0.2,
        scene: "obd_screen",
        ocr_text: [],
        dtc_codes: ["P0420"],
        readings: [],
        objects: [],
        safety_flags: [],
        notes: "",
      }),
    ).toBe(true);
  });

  it("S7 insurance coverage claims are softened", () => {
    expect(applyInsuranceSafetyGuards("Your insurance will be covered for this.")).not.toMatch(
      /will be covered/i,
    );
  });

  it("S8 failed brakes are do-not-drive", () => {
    expect(
      isHighRiskDrivingSituation("My brakes failed, can I drive to the shop?"),
    ).toBe(true);
  });

  it("S9 402/429 fire before the model and hard cap defaults ON", () => {
    delete process.env.AI_COST_HARD_CAP;
    expect(isAiCostHardCapEnabled()).toBe(true);
    expect(
      evaluateAiSpendGate({
        plan: "free",
        spentUsd: 1,
        visionUsed: 0,
        needsVision: false,
      }).ok,
    ).toBe(false);
    const vision = evaluateAiSpendGate({
      plan: "free",
      spentUsd: 0,
      visionUsed: 99,
      needsVision: true,
    });
    expect(vision.ok).toBe(false);
    if (!vision.ok) expect(vision.status).toBe(429);
  });

  it("S10 adapter-off prompt forbids live OBD claims", () => {
    const block = formatObdPreferencePromptBlock(parseObdAdapterPreference(null));
    expect(block).toMatch(/user-provided/i);
    expect(block).toMatch(/Do not claim "live OBD data"/i);
  });

  it("S11 report tone has no Replace the X now", () => {
    const payload = {
      reportId: "GG",
      generatedAtIso: new Date().toISOString(),
      source: "chat",
      vehicle: { year: 2021, make: "Toyota", model: "Camry" },
      ownerObservations: {
        symptoms: "Replace the sensor now.",
        conditions: "",
        checksDone: [],
      },
      diagnosticData: {
        codes: [],
        liveDataSummary: null,
        dataSourceNote: null,
      },
      contributingFactors: [],
      checksCompleted: [],
      technicianNextSteps: [],
      ownerNotes: null,
      disclaimer: "edu",
    } as ShopReportPayload;
    const blob = flattenShopReportText(applyShopReportToneGuards(payload));
    expect(blob.toLowerCase()).not.toMatch(/replace the sensor now/);
  });
});
