import { describe, expect, it } from "vitest";
import {
  SPEC_GAP_REVISIT_SHARE,
  aggregateSpecGapStats,
  classifySpecGapIntents,
  parseSpecGapTags,
  specGapMetadata,
} from "@/lib/spec-gap-intent";

describe("spec-gap intent classifier", () => {
  it("tags oil viscosity and capacity, not a generic oil-change how-to", () => {
    expect(
      classifySpecGapIntents("What oil viscosity and capacity for a 2021 Camry?"),
    ).toEqual(["oil_viscosity_capacity"]);
    expect(classifySpecGapIntents("how many quarts of oil does it take")).toEqual([
      "oil_viscosity_capacity",
    ]);
    expect(classifySpecGapIntents("5W-30 or 0W-20 for winter?")).toEqual([
      "oil_viscosity_capacity",
    ]);
    expect(classifySpecGapIntents("Walk me through an oil change safely")).toEqual(
      [],
    );
  });

  it("tags maintenance interval questions", () => {
    expect(
      classifySpecGapIntents("When is the oil change interval at 42k miles?"),
    ).toContain("maintenance_interval");
    expect(
      classifySpecGapIntents("How often should I replace spark plugs?"),
    ).toContain("maintenance_interval");
    expect(classifySpecGapIntents("maintenance schedule for this car")).toContain(
      "maintenance_interval",
    );
  });

  it("tags torque specs and ignores torque-converter drivability", () => {
    expect(
      classifySpecGapIntents("What's the lug nut torque in ft-lb?"),
    ).toEqual(["torque"]);
    expect(classifySpecGapIntents("torque spec for the drain plug")).toEqual([
      "torque",
    ]);
    expect(classifySpecGapIntents("torque converter shudder on takeoff")).toEqual(
      [],
    );
  });

  it("does not tag recalls, DTCs, or VIN-looking noise", () => {
    expect(classifySpecGapIntents("any recalls?")).toEqual([]);
    expect(classifySpecGapIntents("P0420 catalyst code")).toEqual([]);
    expect(classifySpecGapIntents("4T1C11AK8MU123456")).toEqual([]);
  });

  it("aggregates share and only volume-triggers with enough hits", () => {
    const low = aggregateSpecGapStats(
      Array.from({ length: 10 }, () => ({ tags: ["torque" as const] })),
    );
    expect(low.topics.find((t) => t.tag === "torque")?.share).toBe(1);
    expect(low.volumeTrigger).toBe(false);

    const high = aggregateSpecGapStats([
      ...Array.from({ length: 20 }, () => ({ tags: ["torque" as const] })),
      ...Array.from({ length: 80 }, () => ({ tags: [] })),
    ]);
    expect(high.chatCalls).toBe(100);
    expect(high.topics.find((t) => t.tag === "torque")?.share).toBe(0.2);
    expect(high.volumeTrigger).toBe(true);
    expect(high.revisitShare).toBe(SPEC_GAP_REVISIT_SHARE);

    const underShare = aggregateSpecGapStats([
      ...Array.from({ length: 20 }, () => ({ tags: ["torque" as const] })),
      ...Array.from({ length: 200 }, () => ({ tags: [] })),
    ]);
    expect(underShare.volumeTrigger).toBe(false);
  });

  it("stamps metadata with tags only", () => {
    expect(specGapMetadata([])).toEqual({});
    expect(specGapMetadata(["torque"])).toEqual({ spec_gap: ["torque"] });
    expect(parseSpecGapTags(["torque", "nope", "torque"])).toEqual(["torque"]);
  });
});
