import { describe, expect, it } from "vitest";
import { getFollowUpChips } from "@/lib/chat-repair-loop";
import {
  formatDiyPathBlock,
  matchDiyCheckPath,
} from "@/lib/diy-check-paths";
import { matchSafetyTopicIds } from "@/lib/safety-topics";
import { answerHasInventedCapacityOrTorque } from "@/lib/spec-discipline";
import type { VehicleInfo } from "@/lib/types/chat";
import { gatherVehicleFactAnchors } from "@/lib/vehicle-data/anchors";

const camry: VehicleInfo = {
  id: "v-camry",
  name: "Test Camry",
  year: 2021,
  make: "Toyota",
  model: "Camry",
  market: "US",
  mileage: 42000,
  engine: "2.5L I4",
};

const noMiles: VehicleInfo = { ...camry, mileage: 0 };

describe("US DIY check paths", () => {
  it("maps high-frequency scenes to playbooks, check order, and stop-DIY", () => {
    const cases: Array<{ q: string; id: string; slug: string; topic?: string }> =
      [
        {
          q: "How do I replace brake pads on my Camry?",
          id: "brake_pads",
          slug: "maintenance_brakes",
          topic: "brakes",
        },
        {
          q: "How do I top up coolant on my Camry?",
          id: "coolant_topup",
          slug: "maintenance_cooling_water_pump",
          topic: "cooling_hot",
        },
        {
          q: "When should I change spark plugs?",
          id: "spark_plugs",
          slug: "diagnosis_check_engine",
        },
        {
          q: "TPMS light is on, what should I check?",
          id: "tpms",
          slug: "maintenance_tires",
        },
        {
          q: "How do I test my 12V battery?",
          id: "battery_12v",
          slug: "maintenance_battery",
          topic: "battery_12v",
        },
        {
          q: "Winter wiper blades and battery check",
          id: "seasonal_wipers_battery",
          slug: "maintenance_winter_prep",
        },
        {
          q: "Oil change — how much oil?",
          id: "oil_change",
          slug: "maintenance_oil",
        },
      ];

    for (const row of cases) {
      const path = matchDiyCheckPath(row.q, { month: 1 });
      expect(path?.id, row.q).toBe(row.id);
      expect(path?.playbookSlug, row.q).toBe(row.slug);
      expect(path?.checkOrder.length, row.q).toBeGreaterThanOrEqual(3);
      expect(path?.stopDiy.length, row.q).toBeGreaterThanOrEqual(2);
      const block = formatDiyPathBlock(row.q, camry, { month: 1 });
      expect(block, row.q).toMatch(/\[DIY_PATH\]/);
      expect(block, row.q).toMatch(/Educational check order/);
      expect(block, row.q).toMatch(/Stop DIY/);
      expect(answerHasInventedCapacityOrTorque(block || "")).toBe(false);
      if (row.topic) {
        expect(matchSafetyTopicIds(row.q)).toContain(row.topic);
      }
    }
  });

  it("injects saved mileage only as context and never invents a due mileage", () => {
    const withMiles = formatDiyPathBlock("How do I test my 12V battery?", camry);
    expect(withMiles).toMatch(/42,000 mi/);
    expect(withMiles).toMatch(/Do not invent a service-due mileage/);

    const missing = formatDiyPathBlock("How do I test my 12V battery?", noMiles);
    expect(missing).toMatch(/Mileage is not on file/);
    expect(missing).not.toMatch(/\d+\s*mi/);
  });

  it("picks summer rain playbook for seasonal questions in June", () => {
    const path = matchDiyCheckPath("seasonal wiper blades", { month: 6 });
    expect(path?.playbookSlug).toBe("maintenance_summer_rain_prep");
  });

  it("offers path chips with playbookSlug and no invented specs", () => {
    const chips = getFollowUpChips({
      userText: "How do I top up coolant?",
      assistantText: "Wait until the engine is cool, then use the reservoir.",
    });
    expect(chips.some((c) => c.playbookSlug === "maintenance_cooling_water_pump")).toBe(
      true,
    );
    expect(chips.map((c) => c.prompt).join(" ")).not.toMatch(
      /\b\d+(?:\.\d+)?\s*(?:qts?|ft-?lbs?)\b/i,
    );
    expect(chips.some((c) => c.id === "check-pads")).toBe(false);
  });
});

describe("DIY path inject via fact anchors", () => {
  it("adds [DIY_PATH] for battery questions without fabricating quarts", async () => {
    const block = await gatherVehicleFactAnchors(
      camry,
      "How do I test my 12V battery?",
      { vpic: null, recalls: null, epa: null },
    );
    expect(block).toMatch(/\[DIY_PATH\]/);
    expect(block).toMatch(/maintenance_battery/);
    expect(answerHasInventedCapacityOrTorque(block || "")).toBe(false);
  });
});
