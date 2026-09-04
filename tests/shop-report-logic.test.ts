import { describe, expect, it } from "vitest";
import {
  buildShopReportPreview,
  collectCodesFromMessages,
  vinLast8,
} from "@/lib/shop-report/context";
import {
  formatShopReportRecallEducation,
  shopReportRecallEmptyCopy,
  shopReportRecallUnavailableCopy,
  shopReportWantsNhtsaRecalls,
} from "@/lib/shop-report/recalls";
import {
  SHOP_REPORT_DTC_NOTE,
  SHOP_REPORT_RECALL_MAX,
} from "@/lib/types/shop-report";
import { NHTSA_RECALLS_URL, NHTSA_RECALL_FOOTNOTE } from "@/lib/vehicle-data/recall-copy";
import {
  isShopReportExpired,
  toPublicShopReportPayload,
} from "@/lib/shop-report/public-view";
import {
  sanitizeShopReportFactors,
  sanitizeShopReportSteps,
  applyShopReportToneGuards,
  flattenShopReportText,
} from "@/lib/shop-report/sanitize";
import { resolveShopReportBoundVehicle } from "@/lib/shop-report/bind-vehicle";
import { VEHICLE_NOT_OWNED_CODE } from "@/lib/chat-vehicle-ownership";
import type { ShopReportPayload } from "@/lib/types/shop-report";
import type { VehicleInfo } from "@/lib/types/chat";

const vehicle: VehicleInfo = {
  id: "v1",
  name: "Test",
  year: 2019,
  make: "Toyota",
  model: "Camry",
  market: "US",
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

  it("accepts short Chinese symptom text (CJK code-point threshold)", () => {
    expect(
      buildShopReportPreview({
        vehicle,
        messages: [{ role: "user", content: "卡罗拉空调不出风" }],
      }).hasEnoughData,
    ).toBe(true);
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

  it("lists session DTCs with local titles, not a root-cause claim", () => {
    const codes = collectCodesFromMessages([
      { role: "user", content: "Camry CEL P0420 after a scan" },
      {
        role: "assistant",
        content: "Educational checks only.",
        imageAnalysis: { dtc_codes: ["P0171"] },
      },
    ]);
    expect(codes.map((c) => c.code)).toEqual(["P0420", "P0171"]);
    expect(codes[0].catalogHit).toBe(true);
    expect(codes[0].definition).toMatch(/Catalyst/i);
    expect(codes.map((c) => c.definition).join(" ")).not.toMatch(
      /root cause|must replace|replace now/i,
    );
    expect(SHOP_REPORT_DTC_NOTE).toMatch(/not a root-cause diagnosis/i);
  });

  it("builds a US Camry NHTSA education block (max 3 + link + disclaimer)", () => {
    expect(shopReportWantsNhtsaRecalls(vehicle)).toBe(true);
    expect(
      shopReportWantsNhtsaRecalls({ ...vehicle, market: "EU" }),
    ).toBe(false);
    expect(shopReportWantsNhtsaRecalls(vehicle, false)).toBe(false);

    const education = formatShopReportRecallEducation(vehicle, {
      source: "nhtsa-recalls",
      year: 2019,
      make: "Toyota",
      model: "Camry",
      total: 5,
      cached: false,
      hints: [
        {
          campaignNumber: "19V001000",
          component: "AIR BAGS",
          summary: "Inflator may rupture.",
          consequence: "",
          remedy: "",
          reportReceivedDate: null,
        },
        {
          campaignNumber: "19V002000",
          component: "FUEL SYSTEM, GASOLINE",
          summary: "Pump impeller may crack.",
          consequence: "",
          remedy: "",
          reportReceivedDate: null,
        },
        {
          campaignNumber: "19V003000",
          component: "ELECTRICAL SYSTEM",
          summary: "Software may not detect a fault.",
          consequence: "",
          remedy: "",
          reportReceivedDate: null,
        },
        {
          campaignNumber: "19V004000",
          component: "SERVICE BRAKES",
          summary: "Should not appear — over the cap.",
          consequence: "",
          remedy: "",
          reportReceivedDate: null,
        },
      ],
    });
    expect(education.status).toBe("listed");
    expect(education.hints).toHaveLength(SHOP_REPORT_RECALL_MAX);
    expect(education.hints.map((h) => h.campaignNumber)).not.toContain(
      "19V004000",
    );
    expect(education.lookupUrl).toBe(NHTSA_RECALLS_URL);
    expect(education.footnote).toBe(NHTSA_RECALL_FOOTNOTE);
    expect(JSON.stringify(education)).not.toMatch(/replace now|already fixed/i);
    expect(JSON.stringify(education)).not.toContain(vehicle.vin);

    const empty = formatShopReportRecallEducation(vehicle, {
      source: "nhtsa-recalls",
      year: 2019,
      make: "Toyota",
      model: "Camry",
      total: 0,
      cached: false,
      hints: [],
    });
    expect(empty.status).toBe("empty");
    expect(shopReportRecallEmptyCopy()).toMatch(/returned for this YMM/i);
    expect(formatShopReportRecallEducation(vehicle, null).status).toBe(
      "unavailable",
    );
    expect(shopReportRecallUnavailableCopy().toLowerCase()).not.toMatch(
      /\bno recalls\b/,
    );
  });

  it("default PDF identity is last-8 VIN unless includeFullVin", () => {
    expect(vinLast8(vehicle.vin)).toBe("MN109186");
    const withoutFull = samplePayload({
      vehicle: {
        year: 2019,
        make: "Toyota",
        model: "Camry",
        mileage: 80000,
        vinLast8: "MN109186",
        vinFull: null,
        plate: "ABC123",
      },
    });
    expect(withoutFull.vehicle.vinFull).toBeNull();
    expect(JSON.stringify(withoutFull)).not.toContain("1HGBH41JXMN109186");
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

  it("rejects a vehicle_id that is not in the signed-in garage", () => {
    const requested: VehicleInfo = {
      ...vehicle,
      id: "someone-elses-camry",
    };
    const miss = resolveShopReportBoundVehicle(requested, null);
    expect(miss.ok).toBe(false);
    if (!miss.ok) expect(miss.code).toBe(VEHICLE_NOT_OWNED_CODE);

    const owned: VehicleInfo = { ...vehicle, id: "v1", make: "Toyota" };
    const hit = resolveShopReportBoundVehicle(requested, owned);
    expect(hit.ok).toBe(false);

    const ok = resolveShopReportBoundVehicle(owned, owned, "chat");
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.archiveVehicleId).toBe("v1");
      expect(ok.vehicle.make).toBe("Toyota");
    }

    const session = resolveShopReportBoundVehicle(
      { ...vehicle, id: "coach-session" },
      null,
      "coach",
    );
    expect(session.ok).toBe(true);
    if (session.ok) expect(session.archiveVehicleId).toBeNull();

    const chatNeedsGarage = resolveShopReportBoundVehicle(
      { ...vehicle, id: "coach-session" },
      null,
      "chat",
    );
    expect(chatNeedsGarage.ok).toBe(false);
  });

  it("assembled report text has no Replace the X now after tone guards", () => {
    const raw = samplePayload({
      ownerObservations: {
        symptoms: "Replace the sensor now. Rough idle.",
        conditions: "",
        checksDone: [],
      },
      contributingFactors: [
        {
          title: "O2 sensor",
          explanation: "Replace the sensor now and you are done.",
          howToVerify: "Scan data",
        },
      ],
      technicianNextSteps: ["Replace the sensor now"],
    });
    const guarded = applyShopReportToneGuards(raw);
    const blob = flattenShopReportText(guarded);
    expect(blob.toLowerCase()).not.toMatch(/replace the sensor now/);
    expect(blob.toLowerCase()).not.toMatch(/replace the \w+ now/);
  });

  it("keeps US recall education when the session topic is parking brake", () => {
    const listed = formatShopReportRecallEducation(vehicle, {
      source: "nhtsa-recalls",
      year: 2019,
      make: "Toyota",
      model: "Camry",
      total: 1,
      cached: false,
      hints: [
        {
          campaignNumber: "23V865000",
          component: "AIR BAGS",
          summary: "Occupant classification sensor may malfunction.",
          consequence: "",
          remedy: "",
          reportReceivedDate: null,
        },
      ],
    });
    const raw = samplePayload({
      ownerObservations: {
        symptoms: "Parking brake will not hold on a slope; car creeps.",
        conditions: "On jack stands from an oil change",
        checksDone: ["Set the parking brake"],
      },
      recallEducation: listed,
    });
    const guarded = applyShopReportToneGuards(raw);
    expect(guarded.recallEducation).toEqual(listed);
    expect(guarded.recallEducation?.status).toBe("listed");
    expect(flattenShopReportText(guarded)).toMatch(/parking brake/i);
  });
});
