import { describe, expect, it } from "vitest";
import { buildChatSystemPrompt } from "@/lib/chat-system-prompt";
import type { VehicleInfo } from "@/lib/types/chat";
import type { VpicSnapshot } from "@/lib/vehicle-data/types";
import {
  YMM_UNVERIFIED_TAG,
  detectVpicYmmConflict,
  formatVehicleIdentityPrompt,
  tagsWithYmmUnverified,
  visibleGarageProfileTags,
} from "@/lib/vehicle-data/ymm-conflict";

const snapshot: VpicSnapshot = {
  source: "nhtsa-vpic",
  decodedAt: "2026-01-01T00:00:00.000Z",
  year: 2021,
  make: "TOYOTA",
  model: "Camry",
  trim: "SE",
  engine: "2.5L",
  displacementL: "2.5",
  cylinders: "4",
  fuelType: "Gasoline",
  driveType: "FWD",
  transmission: "Automatic",
  errorText: null,
  raw: { Make: "TOYOTA", Model: "Camry" },
};

const camry: VehicleInfo = {
  id: "v-camry",
  name: "Daily",
  year: 2021,
  make: "Toyota",
  model: "Camry",
  market: "US",
  mileage: 42000,
  engine: "2.5L I4",
  vpicDecode: snapshot,
};

describe("detectVpicYmmConflict", () => {
  it("is silent when garage YMM matches the snapshot", () => {
    expect(detectVpicYmmConflict(camry)).toBeNull();
  });

  it("flags a year/make/model edit away from a saved vPIC snapshot", () => {
    const conflict = detectVpicYmmConflict({
      ...camry,
      year: 2022,
      model: "Corolla",
    });
    expect(conflict?.fields).toEqual(expect.arrayContaining(["year", "model"]));
    expect(conflict?.snapshotYmm).toMatch(/2021/);
    expect(conflict?.garageYmm).toMatch(/2022/);
  });
});

describe("ymm_unverified tags", () => {
  it("round-trips the hand-fill flag without showing it as a profile chip", () => {
    const tagged = tagsWithYmmUnverified(["Daily Driver"], true);
    expect(tagged).toContain(YMM_UNVERIFIED_TAG);
    expect(visibleGarageProfileTags(tagged)).toEqual(["Daily Driver"]);
    expect(tagsWithYmmUnverified(tagged, false)).toEqual(["Daily Driver"]);
  });
});

describe("Chat identity inject", () => {
  it("injects [VEHICLE_CONFLICT] and asks to confirm before coaching", () => {
    const vehicle = { ...camry, year: 2018 };
    const block = formatVehicleIdentityPrompt(vehicle);
    expect(block).toMatch(/\[VEHICLE_CONFLICT\]/);
    const prompt = buildChatSystemPrompt(
      vehicle,
      false,
      null,
      null,
      null,
      null,
      null,
      null,
      block,
    );
    expect(prompt.content).toMatch(/does not match the saved NHTSA vPIC/);
  });

  it("injects [YMM_UNVERIFIED] for hand-filled YMM without listing the tag", () => {
    const vehicle = {
      ...camry,
      vpicDecode: null,
      ymmUnverified: true,
      tags: [YMM_UNVERIFIED_TAG, "Daily Driver"],
    };
    const block = formatVehicleIdentityPrompt(vehicle);
    const prompt = buildChatSystemPrompt(
      vehicle,
      false,
      null,
      null,
      null,
      null,
      null,
      null,
      block,
    );
    expect(prompt.content).toMatch(/\[YMM_UNVERIFIED\]/);
    expect(prompt.content).toMatch(/entered by hand/);
    expect(prompt.content).toMatch(/Daily Driver/);
    expect(prompt.content).not.toMatch(/Profile tags:.*ymm_unverified/i);
  });
});
