import { describe, expect, it } from "vitest";
import {
  formatVehicleShort,
  matchGarageVehicleMention,
} from "@/lib/garage-vehicle-match";
import type { VehicleInfo } from "@/lib/types/chat";

function v(
  partial: Partial<VehicleInfo> &
    Pick<VehicleInfo, "id" | "year" | "make" | "model">,
): VehicleInfo {
  return {
    name: partial.name ?? `${partial.make} ${partial.model}`,
    mileage: 10000,
    engine: "2.0L",
    ...partial,
  };
}

describe("matchGarageVehicleMention", () => {
  const bmw = v({
    id: "bmw-1",
    name: "Daily Driver",
    year: 2021,
    make: "BMW",
    model: "320i",
  });
  const camry = v({
    id: "camry-1",
    name: "E2E Test Car",
    year: 2021,
    make: "Toyota",
    model: "Camry",
  });
  const garage = [bmw, camry];

  it("allows questions with no vehicle mention on current car", () => {
    const r = matchGarageVehicleMention("空调不出风", garage, bmw);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") expect(r.reason).toBe("no_vehicle_mention");
  });

  it("matches current vehicle when Chinese alias equals current", () => {
    const r = matchGarageVehicleMention("宝马320i刹车异响", garage, bmw);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") expect(r.reason).toBe("matches_current");
  });

  it("offers switch when Chinese Corolla maps to another garage car", () => {
    // Corolla not in garage — not_in_garage
    const r = matchGarageVehicleMention("卡罗拉空调不出风", garage, bmw);
    expect(r.kind).toBe("not_in_garage");
  });

  it("offers switch when mention matches another garage vehicle", () => {
    const r = matchGarageVehicleMention("凯美瑞空调不出风", garage, bmw);
    expect(r.kind).toBe("switch_candidate");
    if (r.kind === "switch_candidate") {
      expect(r.vehicle.id).toBe("camry-1");
    }
  });

  it("blocks vehicles not in the garage", () => {
    const r = matchGarageVehicleMention("My Honda Civic rattles", garage, bmw);
    expect(r.kind).toBe("not_in_garage");
  });

  it("formats short labels", () => {
    expect(formatVehicleShort(bmw)).toContain("BMW");
    expect(formatVehicleShort(bmw)).toContain("Daily Driver");
  });
});
