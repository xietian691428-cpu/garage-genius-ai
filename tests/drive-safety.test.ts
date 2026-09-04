import { describe, expect, it } from "vitest";
import {
  applyDriveSafetyGuards,
  formatDriveSafetyBlock,
  isHighRiskDrivingSituation,
} from "@/lib/drive-safety";
import { matchSafetyTopicIds } from "@/lib/safety-topics";

describe("high-risk driving", () => {
  it("treats brake failure / lost steering / active leak as do-not-drive", () => {
    expect(isHighRiskDrivingSituation("My brakes failed, can I drive to the shop?")).toBe(
      true,
    );
    expect(isHighRiskDrivingSituation("I lost steering on the highway")).toBe(true);
    expect(isHighRiskDrivingSituation("Oil is pouring from under the engine")).toBe(
      true,
    );
    expect(isHighRiskDrivingSituation("When should I change brake pads?")).toBe(
      false,
    );
  });

  it("matches the unsafe_to_drive safety topic", () => {
    expect(matchSafetyTopicIds("pedal to the floor, no brakes")).toContain(
      "unsafe_to_drive",
    );
  });

  it("rewrites limp / slowly-drive advice to arrange a tow", () => {
    const out = applyDriveSafetyGuards(
      "You can slowly drive it to the shop if you are careful.",
      "My brakes failed this morning.",
    );
    expect(out.toLowerCase()).not.toMatch(/slowly drive/);
    expect(out).toMatch(/do not drive|arrange a tow/i);
  });

  it("injects a conservative tow line when the model omitted it", () => {
    const out = applyDriveSafetyGuards(
      "Check the fluid when you can.",
      "Steering failed and I almost hit the curb.",
    );
    expect(out).toMatch(/do not drive/i);
    expect(out).toMatch(/arrange a tow/i);
  });

  it("education block forbids limp-home wording", () => {
    expect(formatDriveSafetyBlock()).toMatch(/\[DRIVE_SAFETY\]/);
    expect(formatDriveSafetyBlock()).toMatch(/do not drive/i);
    expect(formatDriveSafetyBlock()).toMatch(/arrange a tow/i);
  });
});
