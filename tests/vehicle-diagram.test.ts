import { describe, expect, it } from "vitest";
import { DASHBOARD_REGIONS } from "@/lib/dashboard-regions";
import { REGION_DIAGRAM_META } from "@/lib/vehicle-diagram-geometry";

describe("vehicle diagram geometry", () => {
  it("has diagram meta for every dashboard region", () => {
    for (const region of DASHBOARD_REGIONS) {
      expect(REGION_DIAGRAM_META[region.id]).toBeTruthy();
      expect(region.hitPath.length).toBeGreaterThan(10);
      expect(region.center.x).toBeGreaterThan(0);
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
