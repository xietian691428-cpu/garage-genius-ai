import { describe, expect, it } from "vitest";
import {
  KM_PER_MILE,
  canAttemptObdMileageWriteback,
  convertOdometerKmToUnit,
  evaluateObdMileageWrite,
  kmToMiles,
  mileageUnitFromMarket,
  obdMileageSkipUserMessage,
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

  it("skips a decrease with a user-facing reason", () => {
    const d = evaluateObdMileageWrite(70_000, 80_000, "miles");
    expect(d).toEqual({ action: "skip", reason: "decreased" });
    expect(
      obdMileageSkipUserMessage("decreased", 80_000, "miles"),
    ).toMatch(/not reduced/i);
  });

  it("skips an implausible one-shot jump", () => {
    const d = evaluateObdMileageWrite(150_000, 80_000, "miles");
    expect(d).toEqual({ action: "skip", reason: "implausible_jump" });
    expect(
      obdMileageSkipUserMessage("implausible_jump", 80_000, "miles"),
    ).toMatch(/not overwritten/i);
  });

  it("allows the first write when archive mileage is 0 even if large", () => {
    expect(evaluateObdMileageWrite(120_000, 0, "miles").action).toBe("write");
  });

  it("unit mix-up (km reading vs miles archive) is a decrease, not a write", () => {
    const storedMiles = 80_000;
    const obdKmMistakenAsSameNumber = convertOdometerKmToUnit(80_000, "miles");
    expect(obdKmMistakenAsSameNumber).toBe(Math.round(80_000 / KM_PER_MILE));
    expect(
      evaluateObdMileageWrite(obdKmMistakenAsSameNumber, storedMiles, "miles"),
    ).toEqual({ action: "skip", reason: "decreased" });
  });

  it("km archive keeps km and still rejects a drop", () => {
    expect(convertOdometerKmToUnit(90_000.4, "km")).toBe(90_000);
    expect(evaluateObdMileageWrite(89_000, 90_000, "km").reason).toBe(
      "decreased",
    );
  });
});
