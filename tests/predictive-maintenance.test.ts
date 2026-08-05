import { describe, expect, it, beforeEach } from "vitest";
import type { VehicleInfo } from "@/lib/types/chat";
import type { MaintenanceRecord } from "@/lib/types/maintenance";
import {
  evaluatePredictiveMaintenance,
  formatDueAroundLine,
} from "@/lib/predictive-maintenance/engine";
import {
  buildHealthSnapshot,
  buildNextRecommendedAction,
} from "@/lib/home-health";
import type { VehicleVitals } from "@/lib/vehicle-vitals";
import {
  isPredictiveItemSnoozed,
  snoozePredictiveItem,
} from "@/lib/predictive-maintenance/snooze";

const baseVehicle: VehicleInfo = {
  id: "v1",
  name: "Daily",
  year: 2018,
  make: "Honda",
  model: "Civic",
  mileage: 88500,
  engine: "2.0L",
};

function vitalsWithCodes(codes: { code: string; desc: string }[]): VehicleVitals {
  return {
    vehicleId: "v1",
    fluids: [],
    codes: codes.map((c) => ({
      ...c,
      severity: "Moderate" as const,
      source: "manual" as const,
      recordedAt: new Date().toISOString(),
    })),
    healthHistory: [],
    updatedAt: new Date().toISOString(),
  };
}

describe("predictive snooze", () => {
  const mem: Record<string, string> = {};
  beforeEach(() => {
    for (const k of Object.keys(mem)) delete mem[k];
    const storage = {
      getItem: (k: string) => mem[k] ?? null,
      setItem: (k: string, v: string) => {
        mem[k] = v;
      },
      removeItem: (k: string) => {
        delete mem[k];
      },
    };
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: storage,
    });
  });

  it("expires when either 30d or 1000mi threshold is met (whichever first)", () => {
    snoozePredictiveItem("v1", "cabin_air_filter", 10000);
    expect(isPredictiveItemSnoozed("v1", "cabin_air_filter", 10000)).toBe(true);
    // mileage threshold hit first
    expect(isPredictiveItemSnoozed("v1", "cabin_air_filter", 11000)).toBe(
      false,
    );
  });
});

describe("predictive maintenance engine", () => {
  it("surfaces due-soon cabin filter near interval without history", () => {
    const cards = evaluatePredictiveMaintenance({
      vehicle: { ...baseVehicle, mileage: 17000 },
      records: [],
      ignoreSnooze: true,
      maxItems: 5,
    });
    const cabin = cards.find((c) => c.key === "cabin_air_filter");
    expect(cabin).toBeTruthy();
    expect(["overdue", "due_soon", "upcoming"]).toContain(cabin!.urgency);
    expect(formatDueAroundLine(cabin!)).toMatch(/around/i);
  });

  it("uses last oil service mileage when present", () => {
    const records: MaintenanceRecord[] = [
      {
        id: "m1",
        userId: "u1",
        vehicleId: "v1",
        title: "Oil change",
        category: "oil",
        mileage: 84000,
        performedAt: "2025-12-01",
        source: "manual",
      },
    ];
    const cards = evaluatePredictiveMaintenance({
      vehicle: baseVehicle,
      records,
      ignoreSnooze: true,
      maxItems: 9,
    });
    const oil = cards.find((c) => c.key === "engine_oil");
    expect(oil).toBeTruthy();
    expect(oil!.basedOnTypicalIntervals).toBe(false);
    expect(oil!.nextDueMileage).toBe(84000 + 6000);
    expect(oil!.urgency).toBe("due_soon");
  });

  it("sorts overdue ahead of upcoming", () => {
    const cards = evaluatePredictiveMaintenance({
      vehicle: { ...baseVehicle, mileage: 50000 },
      records: [],
      ignoreSnooze: true,
      maxItems: 3,
    });
    expect(cards.length).toBeGreaterThan(0);
    for (let i = 1; i < cards.length; i++) {
      const rank = { overdue: 0, due_soon: 1, upcoming: 2 } as const;
      expect(rank[cards[i].urgency]).toBeGreaterThanOrEqual(
        rank[cards[i - 1].urgency],
      );
    }
  });
});

describe("home health helpers", () => {
  it("Attention needed when open DTCs", () => {
    const predictive = evaluatePredictiveMaintenance({
      vehicle: baseVehicle,
      ignoreSnooze: true,
    });
    const snap = buildHealthSnapshot({
      vehicle: baseVehicle,
      vitals: vitalsWithCodes([{ code: "P0171", desc: "System Too Lean" }]),
      predictive,
    });
    expect(snap.kind).toBe("attention");
    expect(snap.title).toBe("Attention needed");
    expect(snap.primaryCta.label).toBe("Continue diagnosis");
  });

  it("Maintenance coming up when due soon and no codes", () => {
    const predictive = evaluatePredictiveMaintenance({
      vehicle: { ...baseVehicle, mileage: 17000 },
      ignoreSnooze: true,
      maxItems: 3,
    });
    const snap = buildHealthSnapshot({
      vehicle: { ...baseVehicle, mileage: 17000 },
      vitals: vitalsWithCodes([]),
      predictive,
    });
    if (predictive.some((p) => p.urgency !== "upcoming")) {
      expect(snap.kind).toBe("maintenance");
      expect(snap.title).toBe("Maintenance coming up");
    }
  });

  it("Looking good when no codes and no near-term items", () => {
    const snap = buildHealthSnapshot({
      vehicle: { ...baseVehicle, mileage: 1000 },
      vitals: vitalsWithCodes([]),
      predictive: [],
    });
    expect(snap.kind).toBe("looking_good");
    expect(snap.title).toBe("Looking good");
  });

  it("Next action prioritizes unfinished diagnosis", () => {
    const next = buildNextRecommendedAction({
      vehicle: baseVehicle,
      vitals: null,
      predictive: [],
      unfinishedDiagnosisHint: "rough idle / P0171",
    });
    expect(next.title).toMatch(/Finish your diagnosis/i);
    expect(next.primary.action).toBe("finish_diagnosis");
  });

  it("does not push Shop Report just because history exists", () => {
    const next = buildNextRecommendedAction({
      vehicle: baseVehicle,
      vitals: vitalsWithCodes([]),
      predictive: [],
    });
    expect(next.primary.action).toBe("describe_symptom");
  });
});
