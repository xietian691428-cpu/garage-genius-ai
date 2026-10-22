import { describe, expect, it } from "vitest";
import {
  applyW10OutputGuards,
  deriveIntake,
  formatIntakeStateBlock,
  intakeChipPrompts,
} from "@/lib/intake";
import { applyDiagnosticToneGuards } from "@/lib/diagnostic-tone";
import { applyDriveSafetyGuards, isHighRiskDrivingSituation } from "@/lib/drive-safety";
import {
  formatLightingPathBlock,
  resolveLightingPath,
} from "@/lib/lighting";
import { formatStopRuleBlock } from "@/lib/safety/stop-rules";
import { parseImageAnalysis } from "@/lib/vision/parse-analysis";
import {
  highConfidenceHousingAssist,
  isLowTrustAnalysis,
} from "@/lib/vision/types";
import type { VehicleInfo } from "@/lib/types/chat";

const camry2020 = {
  id: "v1",
  year: 2020,
  make: "Toyota",
  model: "Camry",
  mileage: 45000,
} as VehicleInfo;

const tacoma2020 = {
  id: "v2",
  year: 2020,
  make: "Toyota",
  model: "Tacoma",
  mileage: 60000,
} as VehicleInfo;

describe("W10a brake warning intake", () => {
  it("brake light on soft pedal → stop-drive, no bleed DIY gate", () => {
    const msg = "brake light on soft pedal — what should I do?";
    const intake = deriveIntake({ currentUserMessage: msg });
    expect(intake.brakeIntent).toBe(true);
    expect(intake.brakeStopDrive).toBe(true);
    expect(intake.slots.pedal_feel).toBe("soft_spongy");
    expect(intake.slots.brake_warning_light).toBe("on");

    const block = formatIntakeStateBlock(intake);
    expect(block).toMatch(/BRAKE GATE/i);
    expect(block).toMatch(/do not drive|tow|professional/i);
    expect(block).toMatch(/FORBIDDEN DIY|bleeding|drain/i);
    expect(block).not.toMatch(/bleed the brakes first/i);

    expect(isHighRiskDrivingSituation(msg)).toBe(true);
    const stop = formatStopRuleBlock(msg);
    expect(stop).toContain("[STOP_RULE]");
    expect(stop).toMatch(/soft|bleed|tow|do not drive/i);

    const guarded = applyW10OutputGuards(
      "Bleed the brakes, open the brake line at the caliper, and drain the brake fluid first. You can slowly drive to the shop.",
      {
        brakeIntent: true,
        brakeStopDrive: true,
        userText: msg,
      },
    );
    expect(guarded).not.toMatch(/\bBleed the brakes\b/);
    expect(guarded).not.toMatch(/\bopen the brake line\b/i);
    expect(guarded).not.toMatch(/\bdrain the brake fluid\b/i);
    expect(guarded).toMatch(/do not drive|tow/i);
    expect(guarded).toMatch(/qualified shop|professional/i);

    const driveGuarded = applyDriveSafetyGuards(
      "It's ok to slowly drive to the shop.",
      msg,
    );
    expect(driveGuarded).toMatch(/do not drive|tow/i);
  });

  it("brake warning alone missing slots → ask ≤2 first", () => {
    const intake = deriveIntake({
      currentUserMessage: "I have a brake warning — what's wrong?",
    });
    expect(intake.brakeIntent).toBe(true);
    expect(intake.preferIntakeQuestions).toBe(true);
    expect(intake.missingCritical.length).toBeGreaterThan(0);
    expect(intake.missingCritical.length).toBeLessThanOrEqual(2);
    const chips = intakeChipPrompts(intake.missingCritical, {
      brakeIntent: true,
    });
    expect(chips.some((c) => /Soft or firm|Warning light|Recent brake/i.test(c))).toBe(
      true,
    );
  });

  it("diagnostic-tone forbids Replace master cylinder now", () => {
    const out = applyDiagnosticToneGuards(
      "It's definitely the master cylinder. Replace master cylinder now.",
    );
    expect(out.toLowerCase()).not.toMatch(/replace master cylinder now/);
    expect(out.toLowerCase()).not.toMatch(/definitely the master cylinder/);
  });

  it("W10 gate rewrites Replace master cylinder now when brake intent", () => {
    const out = applyW10OutputGuards("Replace master cylinder now and bleed the brakes.", {
      brakeIntent: true,
      brakeStopDrive: true,
    });
    expect(out).not.toMatch(/Replace master cylinder now/i);
    expect(out).not.toMatch(/\band bleed the brakes\b/i);
    expect(out).toMatch(/possible causes|professional inspection/i);
  });
});

describe("W10b housing photo assist", () => {
  it("low-confidence housing photo → no H-number path, no sealed lock-in", () => {
    const parsed = parseImageAnalysis(
      JSON.stringify({
        condition: "blurry",
        confidence: 0.25,
        scene: "headlight_housing",
        housing_guess: "dust_cap",
        housing_confidence: "high",
        notes: "maybe dust cap",
      }),
    )!;
    expect(isLowTrustAnalysis(parsed)).toBe(true);
    expect(parsed.housing_guess).toBe("unclear");
    expect(parsed.housing_confidence).toBe("low");

    const assist = highConfidenceHousingAssist(parsed)!;
    expect(assist.housing_confidence).toBe("low");

    const intake = deriveIntake({
      currentUserMessage: "Headlight out — photo of the back of the lamp",
      visionHousing: assist,
    });
    expect(intake.slots.lighting_structure).toBe("unknown");
    expect(intake.evidenceItems.some((e) => /low-confidence|retake|dust cap/i.test(e.text))).toBe(
      true,
    );

    const r = resolveLightingPath(camry2020, "Low beam out — photo attached", {
      visionHousing: assist,
    });
    expect(r!.path).toBe("ambiguous_needs_confirm");
    expect(r!.bulbHint).toBeNull();
    const block = formatLightingPathBlock(
      "Low beam out — photo attached",
      camry2020,
      { visionHousing: assist },
    )!;
    expect(block).not.toMatch(/Allowlisted low-beam hint/i);
    expect(block).toMatch(/none allowlisted|do not invent/i);
  });

  it("high + dust_cap → same path as manual confirm, still verify, no photo→H11 gate", () => {
    const parsed = parseImageAnalysis(
      JSON.stringify({
        condition: "clear",
        confidence: 0.9,
        scene: "headlight_housing",
        housing_guess: "dust_cap",
        housing_confidence: "high",
        notes: "round dust cover visible",
      }),
    )!;
    expect(parsed.housing_guess).toBe("dust_cap");
    const assist = highConfidenceHousingAssist(parsed)!;
    expect(assist).toEqual({
      housing_guess: "dust_cap",
      housing_confidence: "high",
    });

    const intake = deriveIntake({
      currentUserMessage: "Low beam out — photo of housing rear",
      visionHousing: assist,
    });
    expect(intake.slots.lighting_structure).toBe("replaceable_bulb");
    expect(intake.slots.housing_confirm).toBe("photo_assist_dust_cap");

    const r = resolveLightingPath(camry2020, "Low beam out — housing photo", {
      visionHousing: assist,
    });
    expect(r!.path).toBe("likely_replaceable_bulb");
    expect(r!.bulbHint).toMatch(/H11|verify/i);

    // Strip photo→H-number claims when housing photo is low-trust / unclear.
    const lowTrustGate = applyW10OutputGuards(
      "According to the photo this is an H11. The photo proves H11.",
      { housingPhotoLowTrust: true },
    );
    expect(lowTrustGate).not.toMatch(/proves?\s+H11|according to the photo.{0,20}H11/i);
  });

  it("text-only lighting still uses W8/W9 confirm questions (no photo)", () => {
    const intake = deriveIntake({
      currentUserMessage: "My low beam is out — what bulb do I need?",
    });
    expect(intake.lightingIntent).toBe(true);
    expect(intake.slots.lighting_structure).toBe("unknown");
    expect(intake.preferIntakeQuestions).toBe(true);
    const r = resolveLightingPath(camry2020, "My low beam is out — what bulb?");
    expect(r!.path).toBe("ambiguous_needs_confirm");
    expect(r!.bulbHint).toBeNull();
  });
});

describe("W10 ymm expansion (confirm-then-hint)", () => {
  it("Tacoma unconfirmed → multiConfig ambiguous, no H11", () => {
    const r = resolveLightingPath(tacoma2020, "What low beam bulb?");
    expect(r!.path).toBe("ambiguous_needs_confirm");
    expect(r!.multiConfig).toBe(true);
    expect(r!.bulbHint).toBeNull();
  });

  it("Tacoma dust-cap confirm → allowlisted hint with verify", () => {
    const r = resolveLightingPath(
      tacoma2020,
      "Low beam out. Dust cap I can unscrew behind the housing.",
    );
    expect(r!.path).toBe("likely_replaceable_bulb");
    expect(r!.bulbHint).toMatch(/H11|verify/i);
  });
});
