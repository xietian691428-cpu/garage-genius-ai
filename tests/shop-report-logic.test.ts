import { describe, expect, it } from "vitest";
import {
  buildShopReportPreview,
  vinLast8,
} from "@/lib/shop-report/context";
import {
  isShopReportExpired,
  toPublicShopReportPayload,
} from "@/lib/shop-report/public-view";
import {
  sanitizeShopReportFactors,
  sanitizeShopReportSteps,
} from "@/lib/shop-report/sanitize";
import type { ShopReportPayload } from "@/lib/types/shop-report";
import type { VehicleInfo } from "@/lib/types/chat";

const vehicle: VehicleInfo = {
  id: "v1",
  name: "Test",
  year: 2019,
  make: "Toyota",
  model: "Camry",
  mileage: 80000,
  engine: "2.5L",
  vin: "1HGBH41JXMN109186",
};

function samplePayload(overrides?: Partial<ShopReportPayload>): ShopReportPayload {
  return {
    reportId: "GG-TEST",
    generatedAtIso: new Date().toISOString(),
    source: "chat",
    vehicle: {
      year: 2019,
      make: "Toyota",
      model: "Camry",
      mileage: 80000,
      vinLast8: "MN109186",
      vinFull: "1HGBH41JXMN109186",
      plate: "ABC123",
    },
    ownerObservations: {
      symptoms: "Rough idle",
      conditions: "",
      checksDone: [],
    },
    diagnosticData: {
      codes: [],
      liveDataSummary: null,
      dataSourceNote: null,
    },
    contributingFactors: [],
    checksCompleted: [],
    technicianNextSteps: [],
    ownerNotes: null,
    disclaimer: "Education only",
    ...overrides,
  };
}

describe("shop report generate helpers", () => {
  it("vinLast8 returns last 8", () => {
    expect(vinLast8("1HGBH41JXMN109186")).toBe("MN109186");
  });

  it("rejects insufficient diagnosis data", () => {
    const preview = buildShopReportPreview({
      vehicle,
      messages: [{ role: "user", content: "hi" }],
    });
    expect(preview.hasEnoughData).toBe(false);
    expect(preview.reasonIfEmpty).toMatch(/diagnosis/i);
  });

  it("accepts DTC or long symptom text", () => {
    expect(
      buildShopReportPreview({
        vehicle,
        messages: [{ role: "user", content: "Code P0420 on my Camry" }],
      }).hasEnoughData,
    ).toBe(true);

    expect(
      buildShopReportPreview({
        vehicle,
        messages: [
          {
            role: "user",
            content:
              "Rough idle after warm-up with check engine light for several days.",
          },
        ],
      }).hasEnoughData,
    ).toBe(true);
  });

  it("rejects very short symptom-only text", () => {
    const preview = buildShopReportPreview({
      vehicle,
      messages: [{ role: "user", content: "noise" }],
    });
    expect(preview.hasEnoughData).toBe(false);
    expect(preview.reasonIfEmpty).toMatch(/diagnosis|symptoms|fault code/i);
  });

  it("accepts longer symptom-only text without DTC", () => {
    expect(
      buildShopReportPreview({
        vehicle,
        messages: [
          {
            role: "user",
            content:
              "Loud grinding noise when braking from highway speeds after rain.",
          },
        ],
      }).hasEnoughData,
    ).toBe(true);
  });

  it("tone guard softens Replace the sensor language", () => {
    const factors = sanitizeShopReportFactors([
      {
        title: "O2 sensor",
        explanation: "Replace the sensor immediately. Root cause is the O2 sensor.",
        howToVerify: "Scan live data",
      },
    ]);
    expect(factors[0].explanation).not.toMatch(/Replace the sensor/i);
    expect(factors[0].explanation).toMatch(/professional verification/i);

    const steps = sanitizeShopReportSteps([
      "Replace the upstream O2 sensor",
      "Inspect exhaust for leaks",
    ]);
    expect(steps[0]).toMatch(/^Inspect \/ verify/i);
    expect(steps[1]).toBe("Inspect exhaust for leaks");
  });

  it("public payload never exposes full VIN", () => {
    const publicPayload = toPublicShopReportPayload(samplePayload());
    expect(publicPayload.vehicle.vinFull).toBeNull();
    expect(publicPayload.vehicle.vinLast8).toBe("MN109186");
  });

  it("expired token detection", () => {
    expect(isShopReportExpired(new Date(Date.now() - 1000).toISOString())).toBe(
      true,
    );
    expect(
      isShopReportExpired(new Date(Date.now() + 86_400_000).toISOString()),
    ).toBe(false);
    expect(isShopReportExpired(null)).toBe(true);
  });
});
