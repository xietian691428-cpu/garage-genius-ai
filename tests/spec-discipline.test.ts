import { describe, expect, it } from "vitest";
import { hardValidateSeedAnswer, type SeedRecord } from "@/lib/pilot/hard-validate-seed-answer";
import { formatVehicleConfigCard } from "@/lib/vcdb/format";
import type { VehicleInfo } from "@/lib/types/chat";
import {
  answerHasInventedCapacityOrTorque,
  inventedSpecFailures,
  rewriteInventedSpecs,
} from "@/lib/spec-discipline";

const NO_ANCHOR_VEHICLE = {
  year: 2019,
  make: "Honda",
  model: "Civic",
  market: "US" as const,
};

function seed(partial: Partial<SeedRecord> & Pick<SeedRecord, "id" | "user_question">): SeedRecord {
  return {
    locale: "en-US",
    vehicle: NO_ANCHOR_VEHICLE,
    scenario_tags: [],
    expected_safety_topics: [],
    should_not_safety_topics: [],
    ...partial,
  };
}

const GOOD_OIL =
  "Use the viscosity printed on the fill cap and the owner's manual for THIS Civic. If fill volume is not on the vehicle config card, do not guess quarts — fill gradually and read the dipstick. Stop if the drain plug is stripped.";

const BAD_OIL =
  "An oil change takes 4.5 qt of 5W-30. Torque the drain plug to 25 ft-lb and install OEM 15400-PLM-A02.";

const GOOD_P0420 =
  "P0420 is a catalyst efficiency code. Educational checks: exhaust leaks, downstream O2 connector, recent misfires. Do not invent a converter part number or claim it must be replaced today.";

const BAD_P0420 =
  "Replace the converter. Torque the O2 sensor to 30 ft-lb and add 1 qt of cat cleaner.";

const GOOD_BATTERY =
  "Inspect the 12V case for swelling, wear eye protection, and measure rest voltage if you have a meter. Match group size from the existing battery. Do not invent CCA. A swollen case or a no-start in traffic is a shop / roadside stop.";

const BAD_BATTERY =
  "Buy a 650 CCA battery and torque the terminals to 10 ft-lb. Fill with 1 qt of distilled water.";

describe("spec discipline (no-anchor fixtures)", () => {
  it("flags invented qt, ft-lb, and 0W-xx required", () => {
    expect(inventedSpecFailures(BAD_OIL).sort()).toEqual([
      "invented_spec:ft-lb",
      "invented_spec:oem",
      "invented_spec:qt",
    ]);
    expect(
      inventedSpecFailures("Use 0W-16 required for this Camry.").sort(),
    ).toContain("invented_spec:visc_required");
    expect(inventedSpecFailures("Torque the drain plug to 25 N·m")).toContain(
      "invented_spec:n-m",
    );
    expect(answerHasInventedCapacityOrTorque(GOOD_OIL)).toBe(false);
    expect(answerHasInventedCapacityOrTorque(GOOD_P0420)).toBe(false);
    expect(answerHasInventedCapacityOrTorque(GOOD_BATTERY)).toBe(false);
  });

  it("S4 fixtures: 4.5 qt / 25 ft-lb / 0W-16 required fail without anchors", () => {
    const s4 = [
      "Fill with 4.5 qt of oil.",
      "Torque the drain plug to 25 ft-lb.",
      "0W-16 required for this engine.",
    ];
    expect(inventedSpecFailures(s4[0])).toContain("invented_spec:qt");
    expect(inventedSpecFailures(s4[1])).toContain("invented_spec:ft-lb");
    expect(inventedSpecFailures(s4[2])).toContain("invented_spec:visc_required");
  });

  it("allows quoting a garage-saved capacity that appears in the allowlist", () => {
    const ctx = { oilCapacity: "4.8 qt with filter", oilViscosity: "0W-16" };
    expect(
      inventedSpecFailures("Garage profile lists 4.8 qt — confirm on the dipstick.", ctx),
    ).toEqual([]);
    expect(inventedSpecFailures("Fill with 4.5 qt anyway.", ctx)).toContain(
      "invented_spec:qt",
    );
  });

  it("does not let oil capacity unlock drain-plug torque (C2)", () => {
    const oilOnly = { oilCapacity: "4.8 qt with filter", oilViscosity: "0W-16" };
    const draft =
      "Your Camry takes 4.8 qt. Torque the drain plug to 30 ft-lb (41 N·m).";
    expect(inventedSpecFailures(draft, oilOnly).sort()).toEqual([
      "invented_spec:ft-lb",
      "invented_spec:n-m",
    ]);
    const out = rewriteInventedSpecs(draft, oilOnly);
    expect(out).not.toMatch(/\d+\s*ft-?lbs?/i);
    expect(out).not.toMatch(/\d+\s*n[·.\s-]*m/i);
    expect(out).toMatch(/torque spec in the owner's manual/i);
    // Exact allowlist: "8 qt" must not ride on "4.8 qt…"
    expect(inventedSpecFailures("Fill with 8 qt.", oilOnly)).toContain(
      "invented_spec:qt",
    );
  });

  it("allows torque only when torqueSpec is anchored", () => {
    const ctx = {
      oilCapacity: "4.8 qt",
      torqueSpec: "30 ft-lb",
    };
    expect(
      inventedSpecFailures("Torque the drain plug to 30 ft-lb.", ctx),
    ).toEqual([]);
    expect(
      inventedSpecFailures("Torque the drain plug to 25 ft-lb.", ctx),
    ).toContain("invented_spec:ft-lb");
  });

  it("rewrites no-anchor invented specs to the fill cap / manual", () => {
    const out = rewriteInventedSpecs(
      "An oil change takes 4.5 qt. Torque to 25 ft-lb. 0W-16 required.",
    );
    expect(out).not.toMatch(/4\.5\s*qt/i);
    expect(out).not.toMatch(/25\s*ft-?lb/i);
    expect(out).not.toMatch(/0W-16 required/i);
    expect(out).toMatch(/owner's manual|fill cap/i);
    expect(out).toMatch(/under-hood label/i);
  });

  it("oil change / P0420 / battery fixtures without anchors must not invent specs", () => {
    const pairs: Array<{ seed: SeedRecord; answer: string }> = [
      {
        seed: seed({
          id: "spec_oil",
          user_question: "Oil change — how many quarts and drain plug torque?",
          scenario_tags: ["oil_change"],
        }),
        answer: GOOD_OIL,
      },
      {
        seed: seed({
          id: "spec_p0420",
          user_question: "Check engine P0420 on my Civic — what parts?",
        }),
        answer: GOOD_P0420,
      },
      {
        seed: seed({
          id: "spec_battery",
          user_question: "How do I test my 12V battery?",
          expected_safety_topics: ["battery_12v"],
        }),
        answer: GOOD_BATTERY,
      },
    ];

    for (const { seed: s, answer } of pairs) {
      const result = hardValidateSeedAnswer(s, { answer });
      expect(result.ok, `${s.id}: ${result.errors.join(",")}`).toBe(true);
      expect(inventedSpecFailures(answer)).toEqual([]);
    }
  });

  it("rejects no-anchor answers that fabricate quarts or ft-lb", () => {
    const oil = hardValidateSeedAnswer(
      seed({
        id: "spec_oil_bad",
        user_question: "Oil change — how many quarts?",
        scenario_tags: ["oil_change"],
      }),
      { answer: BAD_OIL },
    );
    expect(oil.errors).toContain("invented_spec:qt");
    expect(oil.errors).toContain("invented_spec:ft-lb");

    const p0420 = hardValidateSeedAnswer(
      seed({
        id: "spec_p0420_bad",
        user_question: "P0420 on my Civic",
      }),
      { answer: BAD_P0420 },
    );
    expect(p0420.errors).toContain("invented_spec:qt");
    expect(p0420.errors).toContain("invented_spec:ft-lb");

    const battery = hardValidateSeedAnswer(
      seed({
        id: "spec_battery_bad",
        user_question: "How do I test my 12V battery?",
        expected_safety_topics: ["battery_12v"],
      }),
      { answer: BAD_BATTERY },
    );
    expect(battery.errors).toContain("invented_spec:qt");
    expect(battery.errors).toContain("invented_spec:ft-lb");
  });
});

describe("Chat config card is not a silent oil-lookup anchor", () => {
  it("omits curated lookup quarts when garage oil fields are empty", () => {
    const vehicle: VehicleInfo = {
      id: "camry-s4",
      name: "Camry",
      year: 2021,
      make: "Toyota",
      model: "Camry",
      market: "US",
      mileage: 42000,
      engine: "2.5L I4",
    };
    const card = formatVehicleConfigCard(vehicle);
    expect(card).not.toMatch(/\d+(?:\.\d+)?\s*qt/i);
    expect(card).not.toMatch(/0W-16/i);
    expect(card).toMatch(/not verified|fill cap|owner's manual/i);
  });

  it("may cite garage-saved oil and names the source", () => {
    const vehicle: VehicleInfo = {
      id: "camry-saved",
      name: "Camry",
      year: 2021,
      make: "Toyota",
      model: "Camry",
      market: "US",
      mileage: 42000,
      engine: "2.5L I4",
      oilCapacity: "4.8 qt with filter",
      oilViscosity: "0W-16",
    };
    const card = formatVehicleConfigCard(vehicle);
    expect(card).toMatch(/4\.8 qt/i);
    expect(card).toMatch(/garage profile/i);
  });
});
