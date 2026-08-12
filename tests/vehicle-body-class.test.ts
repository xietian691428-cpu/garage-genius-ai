import { describe, expect, it } from "vitest";
import {
  inferTeslaDiagramKey,
  inferVehicleBodyClass,
} from "@/lib/vehicle-body-class";
import {
  VEHICLE_DIAGRAM_IMAGES,
  vehicleDiagramImageSrc,
} from "@/lib/vehicle-diagram-geometry";

describe("inferVehicleBodyClass", () => {
  it("maps Tesla models to dedicated photos", () => {
    expect(
      inferVehicleBodyClass({
        make: "Tesla",
        model: "Model 3",
        engine: "Electric",
      }),
    ).toBe("tesla_model_3");
    expect(
      inferVehicleBodyClass({
        make: "Tesla",
        model: "Model Y",
        engine: "Dual Motor",
      }),
    ).toBe("tesla_model_y");
    expect(
      inferVehicleBodyClass({
        make: "Tesla",
        model: "Model S",
        engine: "Electric",
      }),
    ).toBe("tesla_model_s");
    expect(
      inferVehicleBodyClass({
        make: "Tesla",
        model: "Model X",
        engine: "Electric",
      }),
    ).toBe("tesla_model_x");
    expect(
      inferVehicleBodyClass({
        make: "Tesla",
        model: "Cybertruck",
        engine: "Electric",
      }),
    ).toBe("tesla_cybertruck");
  });

  it("maps non-Tesla BEVs to generic ev", () => {
    expect(
      inferVehicleBodyClass({
        make: "Ford",
        model: "Mustang Mach-E",
        engine: "Dual Motor EV",
      }),
    ).toBe("ev");
  });

  it("maps vans and MPVs", () => {
    expect(
      inferVehicleBodyClass({
        make: "Ford",
        model: "Transit",
        engine: "3.5L",
        tags: ["Van"],
      }),
    ).toBe("van");
    expect(
      inferVehicleBodyClass({
        make: "Honda",
        model: "Odyssey",
        engine: "3.5L",
      }),
    ).toBe("mpv");
    expect(
      inferVehicleBodyClass({
        make: "Toyota",
        model: "Sienna",
        engine: "Hybrid",
        tags: ["七座", "商务车"],
      }),
    ).toBe("mpv");
  });

  it("maps pickups and SUVs", () => {
    expect(
      inferVehicleBodyClass({
        make: "Toyota",
        model: "Tacoma",
        engine: "3.5L V6",
      }),
    ).toBe("pickup");
    expect(
      inferVehicleBodyClass({
        make: "Toyota",
        model: "RAV4",
        engine: "2.5L",
      }),
    ).toBe("suv");
  });

  it("defaults ice passenger cars to sedan", () => {
    expect(
      inferVehicleBodyClass({
        make: "Toyota",
        model: "Camry",
        engine: "2.5L",
      }),
    ).toBe("sedan");
  });
});

describe("inferTeslaDiagramKey", () => {
  it("returns null for non-Tesla", () => {
    expect(
      inferTeslaDiagramKey({ make: "BMW", model: "i4" }),
    ).toBeNull();
  });
});

describe("vehicle diagram images", () => {
  it("exposes an asset for every body class", () => {
    for (const bodyClass of Object.keys(VEHICLE_DIAGRAM_IMAGES) as Array<
      keyof typeof VEHICLE_DIAGRAM_IMAGES
    >) {
      expect(vehicleDiagramImageSrc(bodyClass)).toContain("/images/vehicle-side-");
    }
  });
});
