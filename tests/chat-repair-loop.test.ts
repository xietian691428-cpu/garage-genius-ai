import { describe, expect, it } from "vitest";
import { CHAT_API_MESSAGE_WINDOW, getChatStarterChips } from "@/lib/chat-repair-loop";
import { usTop10CoreUserQuestionFailures } from "@/lib/pilot/hard-validate-seed-answer";

describe("chat repair loop", () => {
  it("keeps a bounded API history window", () => {
    expect(CHAT_API_MESSAGE_WINDOW).toBeGreaterThan(0);
  });

  it("exposes mapped US high-freq DTC starter chips", () => {
    const chips = getChatStarterChips({
      id: "v1",
      name: "Camry",
      year: 2021,
      make: "Toyota",
      model: "Camry",
      market: "US",
      mileage: 28100,
      engine: "2.5L",
    });
    const labels = chips.map((c) => c.label).join(" ");
    expect(labels).toMatch(/P0420/);
    expect(labels).toMatch(/P0300/);
    expect(chips.some((c) => c.playbookSlug === "diagnosis_exhaust_emissions")).toBe(
      true,
    );
  });
});

describe("US top-10 safety seed CI gate", () => {
  it("user-question matchers still pass on the 10 core seeds", () => {
    expect(usTop10CoreUserQuestionFailures()).toEqual([]);
  });
});
