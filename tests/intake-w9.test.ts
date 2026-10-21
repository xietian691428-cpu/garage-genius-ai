import { describe, expect, it } from "vitest";
import {
  applyW9OutputGuards,
  deriveIntake,
  formatIntakeStateBlock,
  intakeChipPrompts,
} from "@/lib/intake";
import {
  formatLightingPathBlock,
  resolveLightingPath,
} from "@/lib/lighting";
import { formatStopRuleBlock } from "@/lib/safety/stop-rules";
import type { VehicleInfo } from "@/lib/types/chat";

const camry2020 = {
  id: "v1",
  year: 2020,
  make: "Toyota",
  model: "Camry",
  mileage: 45000,
} as VehicleInfo;

const civic2018 = {
  id: "v2",
  year: 2018,
  make: "Honda",
  model: "Civic",
  mileage: 60000,
} as VehicleInfo;

const f150 = {
  id: "v3",
  year: 2018,
  make: "Ford",
  model: "F-150",
  mileage: 80000,
} as VehicleInfo;

describe("W9 lighting multiConfig + hints", () => {
  it("Camry unconfirmed → ambiguous, no H11 hint, multiConfig", () => {
    const r = resolveLightingPath(
      camry2020,
      "Low beam out — what to buy?",
    );
    expect(r!.path).toBe("ambiguous_needs_confirm");
    expect(r!.multiConfig).toBe(true);
    expect(r!.bulbHint).toBeNull();
    const block = formatLightingPathBlock(
      "Low beam out — what to buy?",
      camry2020,
    )!;
    expect(block).not.toMatch(/Allowlisted low-beam hint/);
  });

  it("Camry + dust-cap confirm → replaceable + weak hint with verify", () => {
    const msg =
      "Low beam out. Dust cap I can unscrew behind the housing.";
    const r = resolveLightingPath(camry2020, msg);
    expect(r!.path).toBe("likely_replaceable_bulb");
    expect(r!.bulbHint).toBeTruthy();
    expect(r!.bulbHint!.toLowerCase()).toMatch(/verify|h11/);
    const block = formatLightingPathBlock(msg, camry2020)!;
    expect(block).toMatch(/Allowlisted low-beam hint.*verify/i);
  });

  it("Civic + F-150 multiConfig unconfirmed stay ambiguous", () => {
    for (const v of [civic2018, f150]) {
      const r = resolveLightingPath(v, "What bulb for my headlight low beam?");
      expect(r!.path).toBe("ambiguous_needs_confirm");
      expect(r!.multiConfig).toBe(true);
      expect(r!.bulbHint).toBeNull();
    }
  });

  it("Civic dust-cap confirm may expose allowlisted hint", () => {
    const r = resolveLightingPath(
      civic2018,
      "Headlight out. I confirmed a dust cap I can unscrew.",
    );
    expect(r!.path).toBe("likely_replaceable_bulb");
    expect(r!.bulbHint).toMatch(/H11|verify/i);
  });
});

describe("W9 battery + overheat intake", () => {
  it("car won’t start missing slots → ask-first, not Replace battery now", () => {
    const intake = deriveIntake({
      currentUserMessage: "My car won’t start — what’s wrong?",
    });
    expect(intake.batteryIntent).toBe(true);
    expect(intake.preferIntakeQuestions).toBe(true);
    expect(intake.missingCritical.length).toBeGreaterThan(0);
    const block = formatIntakeStateBlock(intake);
    expect(block).toMatch(/BATTERY\/CRANKING GATE/i);
    expect(block).toMatch(/Replace battery now/i);
    const chips = intakeChipPrompts(intake.missingCritical, {
      batteryIntent: true,
    });
    expect(chips.some((c) => /crank|dim|No crank/i.test(c))).toBe(true);
  });

  it("overheating steam → stop-drive / no hot open gate", () => {
    const msg =
      "Overheating on the highway with steam from under the hood — what do I do?";
    const intake = deriveIntake({ currentUserMessage: msg });
    expect(intake.overheatIntent).toBe(true);
    expect(intake.slots.steam).toBe("yes");
    const block = formatIntakeStateBlock(intake);
    expect(block).toMatch(/OVERHEAT GATE/i);
    expect(block).toMatch(/NEVER|hot radiator|do not keep driving/i);

    const stop = formatStopRuleBlock(msg);
    expect(stop).toContain("[STOP_RULE]");

    const guarded = applyW9OutputGuards(
      "Keep driving to the shop and open the radiator cap while hot to check.",
      {
        overheatIntent: true,
        steamReported: true,
        userText: msg,
      },
    );
    expect(guarded.toLowerCase()).not.toMatch(
      /keep driving to the shop and open the radiator cap while hot/,
    );
    expect(guarded.toLowerCase()).toMatch(/do not|tow|cool/);
  });

  it("W9 lighting gate strips prescribed H11 when structure unknown", () => {
    const out = applyW9OutputGuards("You should buy an H11 bulb today.", {
      lightingStructureUnknown: true,
    });
    expect(out.toLowerCase()).not.toMatch(/buy an h11/);
    expect(out.toLowerCase()).toMatch(/confirm housing|do not invent/);
  });
});
