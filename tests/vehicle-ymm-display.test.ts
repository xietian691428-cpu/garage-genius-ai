import { describe, expect, it } from "vitest";
import {
  formatVehiclePickerLabel,
  formatVehicleYmmDisplay,
  formatVehicleYmmMarket,
} from "@/lib/types/vehicle-market";

const camryUs = {
  name: "Test Camry US 2021",
  year: 2021,
  make: "Toyota",
  model: "Camry",
  submodel: "SE",
  market: "US" as const,
};

const corollaOther = {
  name: "Test Corolla CN",
  year: 2018,
  make: "Toyota",
  model: "Corolla",
  submodel: "SE",
  market: "OTHER" as const,
};

const dailyEu = {
  name: "Daily driver",
  year: 2020,
  make: "VW",
  model: "Golf",
  market: "EU" as const,
};

describe("vehicle ymm display", () => {
  it("keeps prompt/PDF form with explicit market", () => {
    expect(formatVehicleYmmMarket(camryUs)).toBe("2021 Toyota Camry SE - US");
  });

  it("omits US and OTHER on owner-facing labels", () => {
    expect(formatVehicleYmmDisplay(camryUs)).toBe("2021 Toyota Camry SE");
    expect(formatVehicleYmmDisplay(corollaOther)).toBe("2018 Toyota Corolla SE");
  });

  it("keeps non-US sales regions", () => {
    expect(formatVehicleYmmDisplay(dailyEu)).toBe("2020 VW Golf · EU");
  });

  it("does not stack a ymm-like nickname on the picker row", () => {
    expect(formatVehiclePickerLabel(camryUs)).toBe("2021 Toyota Camry SE");
    expect(formatVehiclePickerLabel(corollaOther)).toBe("2018 Toyota Corolla SE");
  });

  it("keeps a real nickname in front of ymm", () => {
    expect(formatVehiclePickerLabel(dailyEu)).toBe(
      "Daily driver · 2020 VW Golf · EU",
    );
  });
});
