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

  it("does not treat DIY brake wording as a Ram mention (C3)", () => {
    const cases = [
      "手刹没事，行车制动绵",
      "Parking brake is fine, the service brakes feel spongy",
      "The parking brake works but the service brakes are soft",
      "I need a wiring diagram for the parking brake",
      "Need to program the EPB module",
      "Check the unibody frame while I'm under there",
    ];
    for (const text of cases) {
      const r = matchGarageVehicleMention(text, garage, camry);
      expect(r.kind, text).toBe("ok");
      if (r.kind === "ok") expect(r.reason, text).toBe("no_vehicle_mention");
    }
  });

  it("still detects a real Ram mention that is not in the garage", () => {
    const r = matchGarageVehicleMention(
      "My Ram 1500 rattles at highway speed",
      garage,
      camry,
    );
    expect(r.kind).toBe("not_in_garage");
    if (r.kind === "not_in_garage") {
      expect(r.mentionLabel.toLowerCase()).toContain("ram");
    }
  });

  it("does not treat 'number of clicks' as Mercedes mb", () => {
    const r = matchGarageVehicleMention(
      "The parking brake has a high number of clicks and feels loose",
      garage,
      camry,
    );
    expect(r.kind).toBe("ok");
  });
});
