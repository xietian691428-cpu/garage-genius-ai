import { describe, expect, it } from "vitest";
import {
  deriveIntake,
  formatIntakeStateBlock,
  intakeChipPrompts,
} from "@/lib/intake";
import { formatEvidenceBlock } from "@/lib/evidence/grades";
import {
  formatStopRuleBlock,
  hasStopRuleHit,
  matchStopRules,
} from "@/lib/safety/stop-rules";
import {
  formatLightingPathBlock,
  lightingFollowUpChips,
  resolveLightingPath,
} from "@/lib/lighting";
import { formatDtcRefBlock, lookupLocalDtc } from "@/lib/vehicle-data/dtc-local";
import type { VehicleInfo } from "@/lib/types/chat";

const camry2020 = {
  id: "v1",
  year: 2020,
  make: "Toyota",
  model: "Camry",
  mileage: 45000,
} as VehicleInfo;

describe("W8 intake slots", () => {
  it("lighting without structure → gate + confirm chips, no bulb size in path", () => {
    const msg = "My low beam is out — what bulb should I buy?";
    const intake = deriveIntake({ currentUserMessage: msg });
    expect(intake.lightingIntent).toBe(true);
    expect(intake.slots.lighting_structure).toBe("unknown");
    expect(intake.missingCritical).toContain("lighting_structure");
    expect(intake.preferIntakeQuestions).toBe(true);

    const block = formatIntakeStateBlock(intake);
    expect(block).toContain("[INTAKE_STATE]");
    expect(block).toMatch(/LIGHTING GATE/i);
    expect(block).toMatch(/do NOT output bulb sizes/i);

    const r = resolveLightingPath(camry2020, msg);
    expect(r!.path).toBe("ambiguous_needs_confirm");
    expect(r!.bulbHint).toBeNull();
    expect(r!.confirmPrompts.length).toBeGreaterThan(0);

    const lightingBlock = formatLightingPathBlock(msg, camry2020);
    expect(lightingBlock).not.toMatch(/Allowlisted low-beam hint/);
    expect(lightingBlock).toMatch(/Structure confirmed this turn: no/);

    const chips = lightingFollowUpChips(msg, camry2020);
    expect(chips.some((c) => /dust|sealed|confirm/i.test(c.label))).toBe(true);
  });

  it("dust-cap confirm → replaceable path; weak hint only if table has one", () => {
    const blob =
      "My low beam is out. Behind the lamp I see a dust cap I can unscrew with a plug-in bulb.";
    const intake = deriveIntake({ currentUserMessage: blob });
    expect(intake.slots.lighting_structure).toBe("replaceable_bulb");
    expect(intake.slots.housing_confirm).toBe("dust_cap_visible");

    const r = resolveLightingPath(camry2020, blob);
    expect(r!.path).toBe("likely_replaceable_bulb");
    expect(r!.playbookSlug).toBe("lighting_replace_bulb");
    // Camry row may allowlist a hint — if present must include verify language in block
    const block = formatLightingPathBlock(blob, camry2020);
    if (r!.bulbHint) {
      expect(block).toMatch(/Allowlisted low-beam hint.*verify/i);
    }
    const chips = lightingFollowUpChips(blob, camry2020);
    expect(chips.map((c) => c.id)).toContain("lighting-bulb-steps");
  });

  it("sealed / OEM LED confirm → no H11 buy path", () => {
    const msg =
      "My headlight is a factory sealed LED heatsink module — what bulb do I buy?";
    const r = resolveLightingPath(camry2020, msg);
    expect(r!.path).toBe("likely_sealed_or_integrated_led");
    expect(r!.bulbHint).toBeNull();
    expect(r!.playbookSlug).toBe("lighting_replace_assembly_basic");
    const block = formatLightingPathBlock(msg, camry2020)!;
    expect(block).not.toMatch(/Allowlisted low-beam hint/);
    expect(block).toMatch(/Bulb size: none allowlisted/i);
    expect(r!.bulbHint).toBeNull();
  });

  it("root-cause ask missing when/side → prefer intake questions", () => {
    const msg = "What's broken? Something is wrong with the car.";
    const intake = deriveIntake({ currentUserMessage: msg });
    expect(intake.seekingRootCause).toBe(true);
    expect(intake.preferIntakeQuestions).toBe(true);
    expect(intake.missingCritical.length).toBeGreaterThan(0);
    const chips = intakeChipPrompts(intake.missingCritical, {
      lightingIntent: intake.lightingIntent,
    });
    expect(chips.length).toBeGreaterThan(0);
    expect(formatIntakeStateBlock(intake)).toMatch(/Ask the missing/i);
  });
});

describe("W8 evidence + stop rules", () => {
  it("evidence block lists grades", () => {
    const intake = deriveIntake({
      currentUserMessage: "P0420 after the car wash, low beam out",
    });
    const ev = formatEvidenceBlock(intake.evidenceItems);
    expect(ev).toContain("[EVIDENCE]");
    expect(ev).toMatch(/OBSERVED|REPORTED|UNVERIFIED/);
  });

  it("adaptive headlight coding → STOP_RULE see a professional", () => {
    const text = "My matrix headlight needs adaptive headlight coding";
    expect(hasStopRuleHit(text)).toBe(true);
    expect(matchStopRules(text).some((r) => r.id.includes("adaptive"))).toBe(
      true,
    );
    const block = formatStopRuleBlock(text)!;
    expect(block).toContain("[STOP_RULE]");
    expect(block.toLowerCase()).toMatch(/qualified technician|do not continue deep diy/);
    expect(block.toLowerCase()).not.toMatch(/step 1: open coding menu/);
  });
});

describe("W8 DTC check_order", () => {
  it("P0420 injects ordered check_order; no Replace converter now mandate", () => {
    const ref = lookupLocalDtc("P0420");
    expect(ref.checkOrder.length).toBeGreaterThanOrEqual(3);
    expect(ref.checkOrder[0].toLowerCase()).toMatch(/exhaust|leak/);
    const block = formatDtcRefBlock("I have code P0420");
    expect(block).toContain("[DTC_REF]");
    expect(block).toMatch(/check_order:/i);
    expect(block).toMatch(/1\)/);
    expect(block).toMatch(/never Replace converter now|Never jump to "Replace converter now"/i);
    // Educational prohibition only — must not assert a parts order
    expect(block).not.toMatch(/must replace the converter|Replace the converter now/i);
  });
});
