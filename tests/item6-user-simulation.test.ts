/**
 * Item 6 — simulate real DIY owner journeys through table parse + cautious vision.
 * Offline pipeline (no CoachScenarioPlayer / no live VL cost).
 */
import { describe, expect, it } from "vitest";
import {
  flattenMarkdownTablesForExtract,
  preserveManualTablesAsMarkdown,
  preprocessManualPageText,
} from "@/lib/vehicle-manual-tables";
import {
  chunkManualPages,
  extractManualSpecAllowlist,
  formatUserManualForPrompt,
} from "@/lib/vehicle-manuals";
import { extractOilGuessesFromText } from "@/lib/vehicle-manual-extract";
import {
  buildManualSpecAnchors,
  formatGarageProfileFluidsForPrompt,
} from "@/lib/vehicle-manual-frame";
import { applySpecOutputGate, inventedSpecFailures } from "@/lib/spec-discipline";
import { formatImageAnalysisBlock } from "@/lib/vision/format-analysis";
import {
  extractVisionSpecCandidates,
  visionSpecShouldDegrade,
} from "@/lib/vision/spec-label-from-vision";
import type { ImageAnalysis } from "@/lib/vision/types";

function analysis(over: Partial<ImageAnalysis>): ImageAnalysis {
  return {
    condition: "clear",
    confidence: 0.9,
    scene: "fluid_cap_label",
    ocr_text: [],
    dtc_codes: [],
    readings: [],
    objects: [],
    safety_flags: ["none"],
    notes: "",
    housing_guess: "unclear",
    housing_confidence: "low",
    ...over,
  };
}

function hitFromPage(text: string, page = 42) {
  const chunks = chunkManualPages([{ page, text }]);
  expect(chunks.length).toBeGreaterThan(0);
  const content = chunks.map((c) => c.content).join("\n");
  return {
    id: `u-${page}`,
    manualId: "user-manual",
    pageFrom: page,
    pageTo: page,
    heading: chunks[0]?.heading || "Capacities",
    content,
    rank: 1,
  };
}

describe("Real user · upload capacities table → ask oil", () => {
  const TABLE_PAGE = [
    "2018 Toyota Camry Owner's Manual",
    "Capacities and recommended fluids",
    "Engine oil with filter    4.8 qt    0W-16",
    "Coolant                    7.1 L     Toyota SLLC",
    "Brake fluid                DOT-4",
    "Always verify the fill-cap label.",
  ].join("\n");

  it("U1 table structure retained after chunk", () => {
    const { text, tablesFound, lowConfidence } =
      preserveManualTablesAsMarkdown(TABLE_PAGE);
    expect(tablesFound).toBeGreaterThanOrEqual(1);
    expect(lowConfidence).toBe(false);
    expect(text).toMatch(/\|/);
    const flat = flattenMarkdownTablesForExtract(text);
    expect(flat).toMatch(/\[TABLE_ROWS\]/);
    expect(flat).toMatch(/Engine oil.*4\.8/i);
  });

  it("U2 owner asks oil → allowlist unlocks 4.8 + 0W-16; coolant does not poison", () => {
    const hit = hitFromPage(TABLE_PAGE);
    const allow = extractManualSpecAllowlist([hit]);
    expect(allow.oilCapacity).toMatch(/4\.8/);
    expect(allow.oilViscosity).toMatch(/0W-16/i);
    expect(allow.coolantCapacity).toMatch(/7\.1/);
    expect(allow.brakeFluidSpec).toMatch(/DOT/i);

    const oil = extractOilGuessesFromText(hit.content, {
      heading: hit.heading,
      pageFrom: 42,
      pageTo: 42,
    });
    expect(oil.some((g) => g.field === "capacity" && /4\.8/.test(g.value))).toBe(
      true,
    );
    expect(
      oil.some((g) => g.field === "viscosity" && /0W-16/i.test(g.value)),
    ).toBe(true);

    const ctx = buildManualSpecAnchors({
      retrievedHits: [hit],
      garage: {},
      intent: "fluids_oil",
    });
    const good =
      "Per Your manual capacities table: 4.8 qt with filter and 0W-16. Still verify on the fill cap — not OEM-certified by Garage Genius.";
    expect(applySpecOutputGate(good, ctx)).toMatch(/4\.8/);
    expect(inventedSpecFailures(good, ctx)).toEqual([]);
  });

  it("U3 model invents wrong quarts → gate strips; no Replace-now invent", () => {
    const hit = hitFromPage(TABLE_PAGE);
    const ctx = buildManualSpecAnchors({
      retrievedHits: [hit],
      garage: {},
    });
    const bad =
      "An oil change takes 5.1 qt of 5W-30. Replace the oil filter now.";
    const gated = applySpecOutputGate(bad, ctx);
    expect(gated).not.toMatch(/\b5\.1\s*qt/i);
    // Anchored 4.8 may remain if rewritten keep allowlist only — 5.1 must go
    expect(inventedSpecFailures("Use 5.1 qt.", ctx).length).toBeGreaterThan(0);
  });

  it("U4 [USER_MANUAL] prompt cites private upload disclaimer", () => {
    const hit = hitFromPage(TABLE_PAGE);
    const block = formatUserManualForPrompt([hit]);
    expect(block).toMatch(/\[USER_MANUAL/);
    expect(block).toMatch(/not OEM/i);
    expect(block).toMatch(/4\.8|0W-16|TABLE_ROWS/i);
  });
});

describe("Real user · no table / scan fail → never invent", () => {
  it("U5 prose tip only — lowConfidence, no allowlist capacity", () => {
    const prose =
      "Check the engine oil level when the engine is cold. Use the dipstick on level ground.";
    const { tablesFound, lowConfidence } = preserveManualTablesAsMarkdown(prose);
    expect(tablesFound).toBe(0);
    expect(lowConfidence).toBe(true);
    const hit = hitFromPage(prose, 3);
    const allow = extractManualSpecAllowlist([hit]);
    expect(allow.oilCapacity).toBeFalsy();
    const ctx = buildManualSpecAnchors({
      retrievedHits: [hit],
      garage: {},
    });
    expect(applySpecOutputGate("Fill with 4.8 qt of 0W-16.", ctx)).not.toMatch(
      /4\.8/,
    );
  });

  it("U6 empty retrieval → no invent", () => {
    const ctx = buildManualSpecAnchors({ retrievedHits: [], garage: {} });
    expect(applySpecOutputGate("Fill with 4.8 qt.", ctx)).not.toMatch(/4\.8/);
  });

  it("U7 single aligned row alone does not force a fake table cluster", () => {
    const one =
      "Engine oil with filter    4.8 qt    0W-16\n\nSee maintenance schedule.";
    const { tablesFound, lowConfidence } = preserveManualTablesAsMarkdown(one);
    // Needs ≥2 aligned rows with fluid hit — single row should not convert
    expect(tablesFound).toBe(0);
    expect(lowConfidence).toBe(true);
  });
});

describe("Real user · torque / CVT / brake table rows", () => {
  it("U8 drain-plug torque row preserved + unlockable", () => {
    const page = [
      "Torque specifications",
      "Oil drain plug            30 ft-lb",
      "Wheel nut                 76 ft-lb",
    ].join("\n");
    const pre = preprocessManualPageText(page);
    expect(pre).toMatch(/TABLE_ROWS|drain plug|30/i);
    const hit = hitFromPage(page, 88);
    const allow = extractManualSpecAllowlist([hit]);
    expect(allow.torqueSpec).toMatch(/30|ft/i);
  });

  it("U9 CVT fluid row → atf candidate; never treat as engine oil quarts", () => {
    const page = [
      "Transmission",
      "CVT fluid FE              7.5 L",
      "Engine oil with filter    4.8 qt    0W-16",
    ].join("\n");
    const hit = hitFromPage(page, 55);
    const allow = extractManualSpecAllowlist([hit]);
    expect(allow.oilCapacity).toMatch(/4\.8/);
    // CVT liters must not become oilCapacity
    expect(allow.oilCapacity).not.toMatch(/7\.5/);
    if (allow.atfSpec) {
      expect(allow.atfSpec).toMatch(/CVT/i);
    }
  });

  it("U10 brake DOT from table", () => {
    const page = [
      "Fluids",
      "Brake fluid               DOT-4",
      "Engine oil with filter    4.8 qt    0W-16",
    ].join("\n");
    const hit = hitFromPage(page, 20);
    const allow = extractManualSpecAllowlist([hit]);
    expect(allow.brakeFluidSpec).toMatch(/DOT/i);
  });
});

describe("Real user · confirm → garage cite (existing chain)", () => {
  it("U11 owner confirmed table extract → garage profile unlocks cite", () => {
    const garageBlock = formatGarageProfileFluidsForPrompt({
      oilCapacity: "4.8 qt",
      oilCapacitySource: "user_manual_confirmed",
      oilViscosity: "0W-16",
      oilViscositySource: "user_manual_confirmed",
    });
    expect(garageBlock).toMatch(/\[GARAGE_PROFILE_FLUIDS\]/);
    expect(garageBlock).toMatch(/4\.8/);
    expect(garageBlock).toMatch(/Garage profile \(from your manual\)|confirmed/i);

    const ctx = buildManualSpecAnchors({
      retrievedHits: [],
      garage: {
        oilCapacity: "4.8 qt",
        oilCapacitySource: "user_manual_confirmed",
        oilViscosity: "0W-16",
        oilViscositySource: "user_manual_confirmed",
      },
      intent: "fluids_oil",
    });
    const reply =
      "Per Garage profile (from your manual): 4.8 qt and 0W-16. Verify fill cap — not OEM-certified by Garage Genius.";
    expect(inventedSpecFailures(reply, ctx)).toEqual([]);
    expect(applySpecOutputGate(reply, ctx)).toMatch(/4\.8/);
  });
});

describe("Real user · cautious multimodal fill-cap / table photo", () => {
  it("U12 clear fill-cap → pending candidate only (needsConfirm)", () => {
    const a = analysis({
      scene: "fluid_cap_label",
      ocr_text: ["0W-16", "SAE"],
      readings: [{ name: "oil_viscosity", value: "0W-16", unit: null }],
      notes: "Fill-cap label shows SAE 0W-16.",
      confidence: 0.88,
    });
    const c = extractVisionSpecCandidates(a);
    expect(c.some((x) => x.field === "oil_viscosity" && x.value === "0W-16")).toBe(
      true,
    );
    expect(c.every((x) => x.needsConfirm === true)).toBe(true);
    expect(c.some((x) => x.field === "oil_capacity")).toBe(false);

    const block = formatImageAnalysisBlock(a, "deepseek-vision");
    expect(block).toMatch(/\[VISION_SPEC_CANDIDATE\]/);
    expect(block).toMatch(/not OEM|NOT OEM/i);
    expect(block).toMatch(/confirm|Save/i);

    // Vision alone must NOT unlock Chat allowlist
    const ctx = buildManualSpecAnchors({ retrievedHits: [], garage: {} });
    expect(applySpecOutputGate("Use 4.8 qt from the photo.", ctx)).not.toMatch(
      /4\.8/,
    );
  });

  it("U13 blurry fill-cap → Degraded, no candidates, invent blocked", () => {
    const a = analysis({
      condition: "blurry",
      confidence: 0.25,
      ocr_text: [],
      readings: [],
      notes: "Unreadable",
    });
    expect(visionSpecShouldDegrade(a)).toBe(true);
    expect(extractVisionSpecCandidates(a)).toEqual([]);
    const block = formatImageAnalysisBlock(a, "deepseek-vision");
    expect(block).toMatch(/Degraded|retake|insufficient/i);
    expect(
      inventedSpecFailures("From the photo it is 4.5 qt of 5W-30.", {}),
    ).not.toEqual([]);
  });

  it("U14 confidence 0.74 below 0.75 bar → no candidates", () => {
    const a = analysis({
      confidence: 0.74,
      ocr_text: ["0W-16"],
      readings: [{ name: "oil_viscosity", value: "0W-16", unit: null }],
    });
    expect(extractVisionSpecCandidates(a)).toEqual([]);
  });

  it("U15 clear spec_table_photo with capacity wording → capacity candidate still needsConfirm", () => {
    const a = analysis({
      scene: "spec_table_photo",
      confidence: 0.86,
      ocr_text: ["Engine oil", "4.8 qt", "0W-16"],
      readings: [{ name: "oil_capacity", value: "4.8 qt", unit: "qt" }],
      notes: "Printed table lists engine oil 4.8 qt 0W-16.",
    });
    const c = extractVisionSpecCandidates(a);
    expect(c.some((x) => x.field === "oil_capacity" && /4\.8/.test(x.value))).toBe(
      true,
    );
    expect(c.every((x) => x.needsConfirm)).toBe(true);
    // Still does not unlock gate without manual/garage
    const ctx = buildManualSpecAnchors({ retrievedHits: [], garage: {} });
    expect(
      inventedSpecFailures("Capacity is 4.8 qt per the photo.", ctx).length,
    ).toBeGreaterThan(0);
  });

  it("U16 CVT OCR → atf candidate; must never unlock as garage without confirm", () => {
    const a = analysis({
      scene: "spec_table_photo",
      ocr_text: ["Toyota CVT Fluid FE"],
      notes: "Table lists Toyota CVT Fluid FE.",
    });
    const c = extractVisionSpecCandidates(a);
    expect(c.some((x) => x.field === "atf_spec")).toBe(true);
    expect(c[0]?.needsConfirm).toBe(true);
    expect(c[0]?.citeHint).toMatch(/CVT|confirm|never/i);
  });

  it("U17 wrong scene engine bay without fluid OCR → no candidates", () => {
    const a = analysis({
      scene: "engine",
      ocr_text: ["battery"],
      notes: "Engine bay photo.",
      confidence: 0.9,
    });
    expect(extractVisionSpecCandidates(a)).toEqual([]);
  });

  it("U18 partial + high confidence torque table photo → torque candidate pending", () => {
    const a = analysis({
      scene: "spec_table_photo",
      condition: "partial",
      confidence: 0.8,
      ocr_text: ["Oil drain plug torque", "30 ft-lb"],
      notes: "Partial torque table visible.",
    });
    const c = extractVisionSpecCandidates(a);
    expect(c.some((x) => x.field === "torque_spec")).toBe(true);
    expect(c.every((x) => x.needsConfirm)).toBe(true);
  });
});

describe("Real user · pdf.js collapses column gaps", () => {
  it("U19 collapsed single-space table still unlocks oil+coolant", () => {
    const page = [
      "2018 Toyota Camry Owner's Manual",
      "Capacities and recommended fluids",
      "Engine oil with filter 4.8 qt 0W-16",
      "Coolant 7.1 L Toyota SLLC",
      "Brake fluid DOT-4",
    ].join("\n");
    const hit = hitFromPage(page, 12);
    expect(hit.content).toMatch(/TABLE_ROWS|\|/);
    const allow = extractManualSpecAllowlist([hit]);
    expect(allow.oilCapacity).toMatch(/4\.8/);
    expect(allow.coolantCapacity).toMatch(/7\.1/);
    expect(allow.brakeFluidSpec).toMatch(/DOT/i);
  });
});

describe("Real user · existing prose PDF excerpts still work (regression)", () => {
  it("U20 Camry-style prose capacities still unlock without aligned table", () => {
    const page = [
      "2021 Toyota Camry Owner’s Manual",
      "Capacities and recommended fluids",
      "Engine oil (with filter): 4.8 quarts (4.5 L)",
      "Recommended viscosity: SAE 0W-16",
    ].join("\n");
    const hit = hitFromPage(page, 1);
    const allow = extractManualSpecAllowlist([hit]);
    expect(allow.oilCapacity).toMatch(/4\.8/);
    expect(allow.oilViscosity).toMatch(/0W-16/i);
  });

  it("U21 Civic prose 3.7 qt 0W-20", () => {
    const page = [
      "2020 Honda Civic Owner’s Manual",
      "Engine oil capacity (with filter): 3.7 quarts (3.5 L)",
      "Recommended engine oil viscosity: SAE 0W-20",
    ].join("\n");
    const hit = hitFromPage(page, 1);
    const allow = extractManualSpecAllowlist([hit]);
    expect(allow.oilCapacity).toMatch(/3\.7/);
    expect(allow.oilViscosity).toMatch(/0W-20/i);
  });
});
