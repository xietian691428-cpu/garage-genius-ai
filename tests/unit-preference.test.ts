import { describe, expect, it } from "vitest";
import { buildChatSystemPrompt } from "@/lib/chat-system-prompt";
import type { VehicleInfo } from "@/lib/types/chat";
import {
  formatUnitPreferenceBlock,
  userMessageUsesMetricUnits,
} from "@/lib/unit-preference";

const camry: VehicleInfo = {
  id: "v1",
  name: "Camry",
  year: 2021,
  make: "Toyota",
  model: "Camry",
  market: "US",
  mileage: 40000,
};

describe("unit preference", () => {
  it("detects user metric units", () => {
    expect(userMessageUsesMetricUnits("Fill with 4.5 L of oil")).toBe(true);
    expect(userMessageUsesMetricUnits("Tire is at 2.2 bar")).toBe(true);
    expect(userMessageUsesMetricUnits("Torque is 110 N·m")).toBe(true);
    expect(userMessageUsesMetricUnits("Door sticker says 32 PSI")).toBe(false);
  });

  it("defaults US vehicles to qt/PSI/ft-lb unless the user used metric", () => {
    const us = formatUnitPreferenceBlock("US", "How much oil does it take?");
    expect(us).toMatch(/follow=us_customary/);
    expect(us).toMatch(/qt \/ PSI \/ ft-lb/);
    const follow = formatUnitPreferenceBlock("US", "Is 4.4 L the fill?");
    expect(follow).toMatch(/follow=metric/);
    expect(follow).toMatch(/L \/ bar \/ kPa \/ N·m/);
  });

  it("puts the US default into the Chat system prompt", () => {
    const prompt = buildChatSystemPrompt(camry, false);
    expect(prompt.content).toMatch(/qt, PSI, ft-lb/);
    expect(prompt.content).toMatch(/contradictory numbers/i);
  });
});
