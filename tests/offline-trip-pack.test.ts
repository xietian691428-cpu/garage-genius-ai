import { describe, expect, it, beforeEach } from "vitest";
import type { VehicleInfo } from "@/lib/types/chat";
import {
  buildTripPack,
  vinTailForPack,
  buildTripPackFluids,
} from "@/lib/offline-trip-pack/build-pack";
import { matchOfflineAssistQuery } from "@/lib/offline-trip-pack/match";
import {
  clearTripPackMemoryForTests,
  loadTripPack,
  saveTripPack,
} from "@/lib/offline-trip-pack/store";
import {
  formatOfflineObdForOnlineChat,
  saveOfflineObdSession,
} from "@/lib/offline-trip-pack/obd-session";
import { shouldOfferOfflineAssist } from "@/lib/offline-trip-pack/online";
import { telHref, systemMapSearchUrl } from "@/lib/offline-trip-pack/maps-links";
import { DRIVE_SAFETY_COPY } from "@/lib/drive-safety";

const camry: VehicleInfo = {
  id: "veh-camry",
  name: "Camry",
  year: 2018,
  make: "Toyota",
  model: "Camry",
  mileage: 62000,
  engine: "2.5L",
  oilCapacity: "4.8 qt with filter",
  oilCapacitySource: "user_manual_confirmed",
  oilViscosity: "0W-16",
  oilViscositySource: "user_manual_confirmed",
  transmissionKind: "cvt",
  atfSpecText: "Toyota CVT Fluid FE",
  atfSpecSource: "user_manual_confirmed",
  vin: "4T1B11HK5JU123456",
};

describe("Offline Trip Pack P0", () => {
  beforeEach(() => {
    clearTripPackMemoryForTests();
  });

  it("packs confirmed fluids only and truncates VIN to last 8", () => {
    const withVcdb: VehicleInfo = {
      ...camry,
      oilCapacity: "99 qt FAKE",
      oilCapacitySource: "vcdb",
      oilViscosity: "5W-30",
      oilViscositySource: "user_entered",
    };
    const fluids = buildTripPackFluids(withVcdb);
    expect(fluids.oilCapacity).toBeUndefined();
    expect(fluids.oilViscosity?.value).toBe("5W-30");
    expect(fluids.transmissionKind).toBe("cvt");
    expect(vinTailForPack(camry.vin)).toBe("JU123456");
  });

  it("buildTripPack embeds stop-rules and never needs AI", () => {
    const pack = buildTripPack({
      userId: "user-1",
      vehicle: camry,
      contacts: { roadsidePhone: "+1-555-0100" },
      now: new Date("2026-11-11T00:00:00Z"),
    });
    expect(pack.vehicleId).toBe("veh-camry");
    expect(pack.identity.vinTail).toBe("JU123456");
    expect(pack.identity.vinTail).not.toContain("4T1B11HK");
    expect(pack.stopRules.some((r) => r.id === "hot_cooling_cap")).toBe(true);
    expect(pack.driveSafety.doNotDrive).toBe(DRIVE_SAFETY_COPY.doNotDrive);
    expect(pack.fluids.oilCapacity?.value).toMatch(/4\.8/);
    expect(pack.approxBytes).toBeGreaterThan(100);
    expect(pack.approxBytes).toBeLessThan(500_000);
  });

  it("persists pack per user×vehicle and rejects cross-vehicle use", async () => {
    const pack = buildTripPack({ userId: "user-1", vehicle: camry });
    await saveTripPack(pack);
    const loaded = await loadTripPack("user-1", "veh-camry");
    expect(loaded?.contentHash).toBe(pack.contentHash);
    const other = await loadTripPack("user-1", "veh-other");
    expect(other).toBeNull();
    expect(loaded?.vehicleId).not.toBe("veh-other");
  });

  it("P0420 returns local catalog check_order without inventing OEM title", () => {
    const m = matchOfflineAssistQuery("Check engine P0420");
    expect(m.dtcRefs).toHaveLength(1);
    expect(m.dtcRefs[0]?.code).toBe("P0420");
    expect(m.dtcRefs[0]?.catalogHit).toBe(true);
    expect(m.dtcRefs[0]?.checkOrder.length).toBeGreaterThan(0);
    expect(m.doNotDrive).toBe(false);
  });

  it("overheating steam prioritizes do-not-drive", () => {
    const m = matchOfflineAssistQuery(
      "overheating with steam from the hood",
    );
    expect(m.doNotDrive).toBe(true);
    expect(m.stopRuleHits.some((r) => r.id === "hot_cooling_cap")).toBe(true);
  });

  it("soft brake pedal is do-not-drive", () => {
    const m = matchOfflineAssistQuery("soft spongy brake pedal and warning light");
    expect(m.doNotDrive).toBe(true);
    expect(m.driveSafetyHit).toBe(true);
  });

  it("offline OBD carry text is user-provided not live", () => {
    const session = saveOfflineObdSession("veh-camry", ["P0420", "P0171"]);
    expect(session.source).toBe("offline_session");
    const text = formatOfflineObdForOnlineChat(session);
    expect(text).toMatch(/user-provided/i);
    expect(text).toMatch(/not live/i);
    expect(text).not.toMatch(/\bsource=live\b/i);
  });

  it("offers offline assist only with pack + network error", () => {
    expect(
      shouldOfferOfflineAssist({
        networkError: true,
        hasPackForVehicle: true,
      }),
    ).toBe(true);
    expect(
      shouldOfferOfflineAssist({
        networkError: true,
        hasPackForVehicle: false,
      }),
    ).toBe(false);
  });

  it("tel and map schemes are available", () => {
    expect(telHref("555-123-4567")).toBe("tel:5551234567");
    expect(systemMapSearchUrl("tow", "ios")).toMatch(/maps\.apple\.com/);
    expect(systemMapSearchUrl("repair", "android")).toMatch(/google\.com\/maps/);
  });
});
