import { describe, expect, it } from "vitest";
import { getFollowUpChips } from "@/lib/chat-repair-loop";
import {
  getDtcFollowUpChips,
  matchPlaybookForDtc,
  lookupDtc,
  buildDtcDiagnosisPrompt,
} from "@/lib/dtc";

describe("DTC follow-up chips", () => {
  it("deep-links P0420 to exhaust playbook and never offers brake-pad chips", () => {
    const parsed = lookupDtc("P0420");
    expect(matchPlaybookForDtc(parsed).slug).toBe(
      "diagnosis_exhaust_emissions",
    );
    const chips = getDtcFollowUpChips("CEL P0420");
    expect(chips.some((c) => c.playbookSlug === "diagnosis_exhaust_emissions")).toBe(
      true,
    );
    expect(chips.map((c) => c.label).join(" ")).not.toMatch(/pad|brake/i);
    expect(chips.map((c) => c.prompt).join(" ")).not.toMatch(/Replace X now/i);

    const follow = getFollowUpChips({
      userText: "any P0420 on my Camry?",
      assistantText: "Catalyst efficiency may be low. Educational checks only.",
    });
    expect(follow.some((c) => c.id === "check-pads")).toBe(false);
    expect(follow.some((c) => c.playbookSlug === "diagnosis_exhaust_emissions")).toBe(
      true,
    );
  });

  it("maps P0300 / P0171 / P0455 / U0100 without inventing unknown codes", () => {
    expect(matchPlaybookForDtc(lookupDtc("P0300")).slug).toBe(
      "diagnosis_check_engine",
    );
    expect(matchPlaybookForDtc(lookupDtc("P0171")).slug).toBe(
      "diagnosis_check_engine",
    );
    expect(matchPlaybookForDtc(lookupDtc("P0455")).slug).toBe(
      "diagnosis_check_engine",
    );
    expect(matchPlaybookForDtc(lookupDtc("P0440")).slug).toBe(
      "diagnosis_check_engine",
    );
    expect(matchPlaybookForDtc(lookupDtc("U0100")).slug).toBe(
      "diagnosis_electrical_lights_sensors",
    );
    for (const code of ["P0300", "P0171", "P0455", "U0100"]) {
      const chips = getDtcFollowUpChips(code);
      expect(chips[0]?.playbookSlug).toBeTruthy();
      expect(chips.some((c) => c.id === "check-pads")).toBe(false);
    }
  });

  it("keeps unknown codes on a generic template", () => {
    const chips = getDtcFollowUpChips("Scanner shows P9999");
    expect(chips.every((c) => !c.playbookSlug)).toBe(true);
    expect(chips.map((c) => c.prompt).join(" ")).toMatch(/not invent/i);
    expect(chips.map((c) => c.label).join(" ")).not.toMatch(/catalyst/i);
  });

  it("leans shop when diy_level is shop", () => {
    const chips = getDtcFollowUpChips("P0606");
    expect(chips.some((c) => c.id === "dtc-checks")).toBe(true);
    expect(chips.find((c) => c.id === "dtc-checks")?.label).toMatch(/shop/i);
    expect(chips.find((c) => c.id === "dtc-checks")?.prompt).toMatch(
      /observe-only|qualified shop/i,
    );
  });

  it("labels pasted/manual codes as user-provided, not live OBD", () => {
    const prompt = buildDtcDiagnosisPrompt({
      codes: [lookupDtc("P0420")],
      source: "manual",
    });
    expect(prompt).toMatch(/user-provided/i);
    expect(prompt.toLowerCase()).not.toMatch(/based on live obd/);
    expect(prompt.toLowerCase()).toMatch(/not live\/realtime obd data/);
  });
});
