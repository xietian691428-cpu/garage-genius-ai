import { describe, expect, it } from "vitest";
import { DASHBOARD_REGIONS } from "@/lib/dashboard-regions";
import {
  REGION_DIAGRAM_META,
  VEHICLE_DIAGRAM_IMAGE_SRC,
  VEHICLE_DIAGRAM_VB,
} from "@/lib/vehicle-diagram-geometry";

describe("vehicle diagram geometry", () => {
  it("uses a photoreal diagram asset and matching viewBox", () => {
    expect(VEHICLE_DIAGRAM_IMAGE_SRC).toMatch(/vehicle-side-profile/);
    expect(VEHICLE_DIAGRAM_VB.w).toBe(760);
    expect(VEHICLE_DIAGRAM_VB.h).toBe(507);
  });

  it("has diagram meta for every dashboard region", () => {
    for (const region of DASHBOARD_REGIONS) {
      expect(REGION_DIAGRAM_META[region.id]).toBeTruthy();
      expect(region.hitPath.length).toBeGreaterThan(10);
      expect(region.center.x).toBeGreaterThan(0);
      expect(region.center.x).toBeLessThan(VEHICLE_DIAGRAM_VB.w);
      expect(region.center.y).toBeGreaterThan(0);
      expect(region.center.y).toBeLessThan(VEHICLE_DIAGRAM_VB.h);
      expect(region.callout?.x).toBeGreaterThan(0);
    }
  });

  it("keeps the eight production system ids", () => {
    expect(DASHBOARD_REGIONS.map((r) => r.id).sort()).toEqual(
      [
        "battery",
        "brakes",
        "engine",
        "hvac",
        "lights",
        "suspension",
        "tires",
        "transmission",
      ].sort(),
    );
  });
});
