import { describe, expect, it } from "vitest";
import {
  detectLightingIntentKind,
  formatLightingPathBlock,
  isLightingIntent,
  lightingFollowUpChips,
  lightingYmmEntryCount,
  resolveLightingPath,
} from "@/lib/lighting";
import { getCoachPlaybook } from "@/lib/coach-scenarios/catalog";
import type { VehicleInfo } from "@/lib/types/chat";

const camry2020 = {
  id: "v1",
  year: 2020,
  make: "Toyota",
  model: "Camry",
  mileage: 45000,
} as VehicleInfo;

const mystery = {
  id: "v2",
  year: 2011,
  make: "Geo",
  model: "Metro",
  mileage: 120000,
} as VehicleInfo;

describe("lighting intent", () => {
  it("matches headlights / LED upgrade / foggy lens", () => {
    expect(isLightingIntent("My low beam is out")).toBe(true);
    expect(isLightingIntent("LED upgrade in halogen housings")).toBe(true);
    expect(isLightingIntent("cloudy yellowed headlight lens")).toBe(true);
    expect(detectLightingIntentKind("upgrade to LED bulbs")).toBe("led_upgrade");
  });

  it("does not treat CEL as exterior lighting", () => {
    expect(isLightingIntent("check engine light came on")).toBe(false);
  });
});

describe("resolveLightingPath", () => {
  it("Camry 2020 buy question → ambiguous + confirm; no bulb hint until structure confirmed", () => {
    const r = resolveLightingPath(
      camry2020,
      "My low beam is out — should I buy a bulb or the whole assembly?",
    );
    expect(r).not.toBeNull();
    expect(r!.path).toBe("ambiguous_needs_confirm");
    expect(r!.multiConfig).toBe(true);
    expect(r!.confirmPrompts.length).toBeGreaterThan(0);
    expect(r!.bulbHint).toBeNull();
    expect(r!.playbookSlug).toBe("diagnosis_electrical_lights_sensors");
  });

  it("Camry after dust-cap confirm → replaceable; hint only if allowlisted", () => {
    const r = resolveLightingPath(
      camry2020,
      "Low beam out. I confirmed a dust cap I can unscrew behind the housing.",
    );
    expect(r!.path).toBe("likely_replaceable_bulb");
    expect(r!.playbookSlug).toBe("lighting_replace_bulb");
  });

  it("unknown YMM → no invented bulb size", () => {
    const r = resolveLightingPath(
      mystery,
      "Which headlight bulb do I need for low beam?",
    );
    expect(r).not.toBeNull();
    expect(r!.path).toBe("ambiguous_needs_confirm");
    expect(r!.dataMissing).toBe(true);
    expect(r!.bulbHint).toBeNull();
    const block = formatLightingPathBlock(
      "Which headlight bulb do I need for low beam?",
      mystery,
    );
    expect(block).toContain("[LIGHTING_PATH]");
    expect(block).toMatch(/none allowlisted|do NOT invent/i);
    expect(block).not.toMatch(/Allowlisted low-beam hint/);
  });

  it("LED upgrade intent includes glare / legality education cautions", () => {
    const r = resolveLightingPath(
      camry2020,
      "I want to put plug and play LED bulbs in my halogen headlights",
    );
    expect(r!.intent).toBe("led_upgrade");
    expect(r!.cautions.join(" ").toLowerCase()).toMatch(/glare/);
    expect(r!.cautions.join(" ").toLowerCase()).toMatch(/fmvss|local/);
    expect(r!.cautions.join(" ").toLowerCase()).not.toMatch(/definitely legal/);
  });

  it("notes can confirm sealed LED without inventing parts", () => {
    const v = {
      ...camry2020,
      notes: "Factory LED headlamp package confirmed",
    } as VehicleInfo;
    const r = resolveLightingPath(v, "headlight assembly replacement steps");
    expect(r!.path).toBe("likely_sealed_or_integrated_led");
    expect(r!.bulbHint).toBeNull();
  });

  it("table has weak coverage rows", () => {
    expect(lightingYmmEntryCount()).toBeGreaterThan(5);
  });
});

describe("lighting chips + playbooks", () => {
  it("unconfirmed → confirm chips first; sealed path skips bulb steps", () => {
    const chips = lightingFollowUpChips(
      "low beam out bulb or assembly",
      camry2020,
    );
    expect(chips.map((c) => c.id)).toContain("lighting-confirm-housing");
    expect(chips.length).toBeGreaterThanOrEqual(3);

    const sealedChips = lightingFollowUpChips(
      "factory sealed LED heatsink module headlight",
      camry2020,
    );
    expect(sealedChips.map((c) => c.id)).toContain("lighting-assembly-path");
    expect(sealedChips.map((c) => c.id)).not.toContain("lighting-bulb-steps");
  });

  it("registers lighting Coach playbooks", () => {
    for (const slug of [
      "lighting_replace_bulb",
      "lighting_replace_assembly_basic",
      "lighting_lens_restore_edu",
    ] as const) {
      const pb = getCoachPlaybook(slug);
      expect(pb?.slug).toBe(slug);
      expect(pb?.steps.length).toBeGreaterThan(2);
      expect(pb?.completion.log_category).toBe("electrical");
    }
  });

  it("bulb playbook mentions avoiding halogen glass touch", () => {
    const pb = getCoachPlaybook("lighting_replace_bulb");
    const blob = pb!.steps.map((s) => s.description).join(" ");
    expect(blob.toLowerCase()).toMatch(/halogen|glass|bare skin|oils/);
    expect(blob).not.toMatch(/Replace the assembly now/i);
  });
});
