import { describe, expect, it } from "vitest";
import { resolveChatVehicleGate } from "@/lib/chat-vehicle-gate";
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

describe("resolveChatVehicleGate", () => {
  const bmw = v({
    id: "bmw-1",
    name: "Daily",
    year: 2021,
    make: "BMW",
    model: "320i",
  });
  const camryA = v({
    id: "camry-a",
    name: "Camry A",
    year: 2021,
    make: "Toyota",
    model: "Camry",
  });
  const camryB = v({
    id: "camry-b",
    name: "Camry B",
    year: 2019,
    make: "Toyota",
    model: "Camry",
  });

  it("blocks empty garage", () => {
    const r = resolveChatVehicleGate({
      text: "AC no air",
      garage: [],
      current: null,
      canAddVehicle: true,
      maxVehicles: 1,
    });
    expect(r.code).toBe("empty_garage");
  });

  it("blocks when no vehicle selected", () => {
    const r = resolveChatVehicleGate({
      text: "AC no air",
      garage: [bmw],
      current: null,
      canAddVehicle: true,
      maxVehicles: 5,
    });
    expect(r.code).toBe("no_vehicle_selected");
  });

  it("offers add when mention not in garage and slots remain", () => {
    const r = resolveChatVehicleGate({
      text: "卡罗拉空调不出风",
      garage: [bmw],
      current: bmw,
      canAddVehicle: true,
      maxVehicles: 5,
    });
    expect(r.code).toBe("not_in_garage_can_add");
    if (r.code === "not_in_garage_can_add") {
      expect(r.mentionLabel.toLowerCase()).toContain("corolla");
    }
  });

  it("offers upgrade path when slots full", () => {
    const r = resolveChatVehicleGate({
      text: "卡罗拉空调不出风",
      garage: [bmw],
      current: bmw,
      canAddVehicle: false,
      maxVehicles: 1,
    });
    expect(r.code).toBe("not_in_garage_limit");
  });

  it("forces pick when multiple same model", () => {
    const r = resolveChatVehicleGate({
      text: "凯美瑞空调不出风",
      garage: [bmw, camryA, camryB],
      current: bmw,
      canAddVehicle: true,
      maxVehicles: 5,
    });
    expect(r.code).toBe("ambiguous");
    if (r.code === "ambiguous") {
      expect(r.candidates).toHaveLength(2);
    }
  });

  it("asks to switch when unique other garage car matches", () => {
    const r = resolveChatVehicleGate({
      text: "Camry blower not working",
      garage: [bmw, camryA],
      current: bmw,
      canAddVehicle: true,
      maxVehicles: 5,
    });
    expect(r.code).toBe("switch_confirm");
    if (r.code === "switch_confirm") {
      expect(r.vehicle.id).toBe("camry-a");
    }
  });

  it("proceeds on current vehicle with no mention", () => {
    const r = resolveChatVehicleGate({
      text: "鼓风机不转",
      garage: [bmw, camryA],
      current: bmw,
      canAddVehicle: true,
      maxVehicles: 5,
    });
    expect(r.code).toBe("ok");
    if (r.code === "ok") expect(r.vehicle.id).toBe("bmw-1");
  });

  it("does not gate Camry DIY brake text as a missing Ram (C3)", () => {
    const r = resolveChatVehicleGate({
      text: "手刹没事，行车制动绵",
      garage: [camryA],
      current: camryA,
      canAddVehicle: false,
      maxVehicles: 5,
    });
    expect(r.code).toBe("ok");
    if (r.code === "ok") expect(r.vehicle.id).toBe("camry-a");
  });
});
