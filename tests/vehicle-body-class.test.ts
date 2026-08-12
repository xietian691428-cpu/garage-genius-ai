import { describe, expect, it } from "vitest";
import { inferVehicleBodyClass } from "@/lib/vehicle-body-class";
import {
  VEHICLE_DIAGRAM_IMAGES,
  vehicleDiagramImageSrc,
} from "@/lib/vehicle-diagram-geometry";

describe("inferVehicleBodyClass", () => {
  it("maps battery-electric vehicles to ev", () => {
    expect(
      inferVehicleBodyClass({
        make: "Tesla",
        model: "Model 3",
        engine: "Electric",
        tags: ["EV"],
      }),
    ).toBe("ev");
    expect(
      inferVehicleBodyClass({
        make: "Ford",
        model: "Mustang Mach-E",
        engine: "Dual Motor EV",
      }),
    ).toBe("ev");
  });

  it("maps pickups before generic SUV keywords", () => {
    expect(
      inferVehicleBodyClass({
        make: "Toyota",
        model: "Tacoma",
        engine: "3.5L V6",
      }),
    ).toBe("pickup");
    expect(
      inferVehicleBodyClass({
        make: "Ford",
        model: "F-150",
        engine: "5.0L V8",
        tags: ["Tow"],
      }),
    ).toBe("pickup");
  });

  it("maps crossovers and SUVs", () => {
    expect(
      inferVehicleBodyClass({
        make: "Toyota",
        model: "RAV4",
        engine: "2.5L",
      }),
    ).toBe("suv");
    expect(
      inferVehicleBodyClass({
        make: "BMW",
        model: "X5",
        engine: "3.0L",
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
    expect(
      inferVehicleBodyClass({
        make: "BMW",
        model: "320i",
        engine: "2.0L Turbo",
      }),
    ).toBe("sedan");
  });
});

describe("vehicle diagram images", () => {
  it("exposes an asset for every body class", () => {
    for (const bodyClass of Object.keys(VEHICLE_DIAGRAM_IMAGES) as Array<
      keyof typeof VEHICLE_DIAGRAM_IMAGES
    >) {
      expect(vehicleDiagramImageSrc(bodyClass)).toMatch(`/images/vehicle-side-${bodyClass}.jpg`);
    }
  });
});
