import { describe, expect, it } from "vitest";
import { nameLooksLikeObdAdapter } from "@/lib/obd-transport";

describe("native BLE OBD name filter", () => {
  it("accepts common open ELM327 BLE names", () => {
    expect(nameLooksLikeObdAdapter("OBDII")).toBe(true);
    expect(nameLooksLikeObdAdapter("Veepeak")).toBe(true);
    expect(nameLooksLikeObdAdapter("vLinker MS")).toBe(true);
    expect(nameLooksLikeObdAdapter("iCar Pro")).toBe(true);
    expect(nameLooksLikeObdAdapter("LELink")).toBe(true);
    expect(nameLooksLikeObdAdapter("Kiwi 3")).toBe(true);
  });

  it("rejects empty and unrelated peripherals", () => {
    expect(nameLooksLikeObdAdapter("")).toBe(false);
    expect(nameLooksLikeObdAdapter("AirPods Pro")).toBe(false);
    expect(nameLooksLikeObdAdapter("Galaxy Watch")).toBe(false);
  });
});
