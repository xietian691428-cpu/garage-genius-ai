import { describe, expect, it } from "vitest";
import {
  KM_PER_MILE,
  canAttemptObdMileageWriteback,
  convertOdometerKmToUnit,
  kmToMiles,
  mileageUnitFromMarket,
  shouldWriteObdMileage,
} from "@/lib/obd-mileage";

describe("OBD mileage write-back logic", () => {
  it("updates when new reading is greater", () => {
    expect(shouldWriteObdMileage(90_000, 80_000)).toBe("write");
  });

  it("touches timestamp only when equal", () => {
    expect(shouldWriteObdMileage(80_000, 80_000)).toBe("touch");
  });

  it("skips when new reading is lower", () => {
    expect(shouldWriteObdMileage(70_000, 80_000)).toBe("skip");
  });

  it("converts km to miles correctly", () => {
    const miles = convertOdometerKmToUnit(160_934, "miles");
    expect(miles).toBe(Math.round(160_934 / KM_PER_MILE));
    expect(kmToMiles(KM_PER_MILE)).toBeCloseTo(1, 5);
  });

  it("keeps km when archive unit is km", () => {
    expect(convertOdometerKmToUnit(123_456, "km")).toBe(123_456);
  });

  it("infers unit from market", () => {
    expect(mileageUnitFromMarket("US")).toBe("miles");
    expect(mileageUnitFromMarket("EU")).toBe("km");
  });

  it("blocks write-back when has_obd_adapter is false", () => {
    expect(canAttemptObdMileageWriteback(false, 100_000)).toBe(false);
    expect(canAttemptObdMileageWriteback(true, null)).toBe(false);
    expect(canAttemptObdMileageWriteback(true, 100_000)).toBe(true);
  });
});
