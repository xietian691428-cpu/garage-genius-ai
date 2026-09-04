import { describe, expect, it } from "vitest";
import {
  bindChatVehicleIdentity,
  bindConversationFocusToVehicle,
  vehicleSelectionMismatch,
} from "@/lib/chat-vehicle-ownership";
import type { VehicleInfo } from "@/lib/types/chat";
import type { TurnFocus } from "@/lib/chat-intent-drift";

function v(
  partial: Partial<VehicleInfo> & Pick<VehicleInfo, "id" | "year" | "make" | "model">,
): VehicleInfo {
  return {
    name: partial.name ?? `${partial.make} ${partial.model}`,
    mileage: 10000,
    engine: "2.0L",
    ...partial,
  };
}

describe("vehicleSelectionMismatch", () => {
  it("is false when either id is missing (legacy clients)", () => {
    expect(vehicleSelectionMismatch(undefined, "a")).toBe(false);
    expect(vehicleSelectionMismatch("a", undefined)).toBe(false);
  });

  it("is true when header and request vehicle_id differ", () => {
    expect(vehicleSelectionMismatch("camry-a", "camry-b")).toBe(true);
    expect(vehicleSelectionMismatch("camry-a", "camry-a")).toBe(false);
  });
});

describe("bindChatVehicleIdentity", () => {
  it("uses the owned garage row for YMM and mileage so a spoofed client payload cannot switch cars", () => {
    const client = v({
      id: "camry-a",
      year: 2018,
      make: "Honda",
      model: "Civic",
      mileage: 999999,
      notes: "client note",
    });
    const owned = v({
      id: "camry-a",
      year: 2021,
      make: "Toyota",
      model: "Camry",
      mileage: 42000,
      notes: "garage note",
      market: "US",
    });
    const bound = bindChatVehicleIdentity(client, owned);
    expect(bound.year).toBe(2021);
    expect(bound.make).toBe("Toyota");
    expect(bound.model).toBe("Camry");
    expect(bound.mileage).toBe(42000);
    expect(bound.notes).toBe("garage note");
  });
});

describe("bindConversationFocusToVehicle", () => {
  it("drops previous/abandoned focus when vehicle_id does not match", () => {
    const previous: TurnFocus = {
      summary: "Oil change on the F-150 at 120,000 miles",
      topics: [],
      entities: ["oil"],
      isHighRisk: false,
      turnIndex: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const bound = bindConversationFocusToVehicle(
      {
        vehicleId: "f150-1",
        previous,
        abandoned: previous,
        apiHistoryFromId: "old-msg",
      },
      "camry-a",
    );
    expect(bound?.previous).toBeNull();
    expect(bound?.abandoned).toBeNull();
    expect(bound?.apiHistoryFromId).toBeNull();
    expect(bound?.vehicleId).toBe("camry-a");
  });

  it("keeps focus when vehicle_id matches", () => {
    const previous: TurnFocus = {
      summary: "P0420 on the Camry",
      topics: [],
      entities: [],
      isHighRisk: false,
      turnIndex: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const bound = bindConversationFocusToVehicle(
      { vehicleId: "camry-a", previous, apiHistoryFromId: "u-1" },
      "camry-a",
    );
    expect(bound?.previous?.summary).toMatch(/P0420/);
    expect(bound?.apiHistoryFromId).toBe("u-1");
  });

  it("drops focus when vehicleId is missing on the payload (untrusted)", () => {
    const previous: TurnFocus = {
      summary: "Already on jack stands mid oil change",
      topics: ["lifting_under_car"],
      entities: ["jack_stands", "oil"],
      isHighRisk: true,
      vehicleRaised: true,
      parkingBrakeState: "not_holding",
      turnIndex: 2,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const bound = bindConversationFocusToVehicle(
      { previous, abandoned: previous, apiHistoryFromId: "camry-msg" },
      "bmw-1",
    );
    expect(bound?.previous).toBeNull();
    expect(bound?.abandoned).toBeNull();
    expect(bound?.apiHistoryFromId).toBeNull();
    expect(bound?.vehicleId).toBe("bmw-1");
  });
});
