import { describe, expect, it } from "vitest";
import { formatImageAnalysisBlock } from "@/lib/vision/format-analysis";
import {
  extractVisionSpecCandidates,
  visionSpecShouldDegrade,
} from "@/lib/vision/spec-label-from-vision";
import type { ImageAnalysis } from "@/lib/vision/types";
import { inventedSpecFailures } from "@/lib/spec-discipline";

function base(over: Partial<ImageAnalysis>): ImageAnalysis {
  return {
    condition: "clear",
    confidence: 0.88,
    scene: "fluid_cap_label",
    ocr_text: ["0W-16", "SAE"],
    dtc_codes: [],
    readings: [{ name: "oil_viscosity", value: "0W-16", unit: null }],
    objects: ["oil fill cap"],
    safety_flags: ["none"],
    notes: "Fill-cap label shows SAE 0W-16.",
    housing_guess: "unclear",
    housing_confidence: "low",
    ...over,
  };
}

describe("cautious vision spec candidates", () => {
  it("extracts viscosity from clear fill-cap OCR", () => {
    const c = extractVisionSpecCandidates(base({}));
    expect(c.some((x) => x.field === "oil_viscosity" && x.value === "0W-16")).toBe(
      true,
    );
    expect(c.every((x) => x.needsConfirm === true)).toBe(true);
  });

  it("degrades blurry / low confidence — no candidates", () => {
    const blur = base({
      condition: "blurry",
      confidence: 0.3,
      ocr_text: [],
      readings: [],
    });
    expect(visionSpecShouldDegrade(blur)).toBe(true);
    expect(extractVisionSpecCandidates(blur)).toEqual([]);
  });

  it("does not invent capacity from viscosity-only cap", () => {
    const c = extractVisionSpecCandidates(base({}));
    expect(c.some((x) => x.field === "oil_capacity")).toBe(false);
  });

  it("formatImageAnalysisBlock includes VISION_SPEC_CANDIDATE for clear label", () => {
    const block = formatImageAnalysisBlock(base({}), "deepseek-vision");
    expect(block).toMatch(/\[VISION_SPEC_CANDIDATE\]/);
    expect(block).toMatch(/0W-16/);
    expect(block).toMatch(/not OEM-certified|NOT OEM/i);
  });

  it("low trust block says Degraded and invent gate stays closed", () => {
    const block = formatImageAnalysisBlock(
      base({ condition: "unreadable", confidence: 0.1, ocr_text: [], readings: [] }),
      "deepseek-vision",
    );
    expect(block).toMatch(/Degraded|retake/i);
    expect(inventedSpecFailures("Use 4.5 qt from the photo.", {})).not.toEqual(
      [],
    );
  });

  it("CVT OCR candidate never unlocks as garage without confirm", () => {
    const c = extractVisionSpecCandidates(
      base({
        scene: "spec_table_photo",
        ocr_text: ["CVT Fluid FE", "Toyota"],
        readings: [],
        notes: "Table lists Toyota CVT Fluid FE.",
      }),
    );
    expect(c.some((x) => x.field === "atf_spec")).toBe(true);
    expect(c[0]?.needsConfirm).toBe(true);
  });
});
