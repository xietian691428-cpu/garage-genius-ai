import { describe, expect, it } from "vitest";
import {
  classifyChatMiss,
  desensitizeText,
  draftGoldCaseFromMiss,
  severityForDimensions,
  validateGoldCaseDraft,
} from "@/lib/pilot/miss-feedback";

describe("miss feedback desensitize", () => {
  it("redacts VIN and email", () => {
    const out = desensitizeText(
      "My VIN is 1HGBH41JXMN109186 email me at a@b.com soft brakes",
    );
    expect(out).not.toMatch(/1HGBH41JXMN109186/);
    expect(out).toMatch(/\[VIN\]/);
    expect(out).toMatch(/\[email\]/);
    expect(out).toMatch(/soft brakes/);
  });
});

describe("classifyChatMiss", () => {
  it("flags safety_stop when soft brakes ask lacks stop cues", () => {
    const miss = classifyChatMiss({
      userText: "brakes feel mushy when I press them",
      rawReply: "Maybe the pads are worn. Keep driving carefully.",
    });
    expect(miss).not.toBeNull();
    expect(miss!.dimensions).toContain("safety_stop");
    expect(miss!.severity).toBe("critical");
    expect(miss!.intentSnippet).toMatch(/mushy/i);
  });

  it("flags invented_specs without anchors", () => {
    const miss = classifyChatMiss({
      userText: "how much oil for an oil change?",
      rawReply: "An oil change takes 4.5 qt of 5W-30.",
    });
    expect(miss?.dimensions).toContain("invented_specs");
  });

  it("flags citation_miss when garage fluids present but reply omits cite", () => {
    const miss = classifyChatMiss({
      userText: "how much oil and what viscosity?",
      rawReply: "Use whatever is common for Toyotas.",
      hadGarageFluids: true,
      specCtx: { oilCapacity: "4.8 qt with filter", oilViscosity: "0W-16" },
    });
    expect(miss?.dimensions).toContain("citation_miss");
  });

  it("flags replace_now tone", () => {
    const miss = classifyChatMiss({
      userText: "P0300 shaking",
      rawReply: "It's definitely the coils. Replace all ignition coils now.",
    });
    expect(miss?.dimensions).toContain("replace_now");
  });

  it("returns null for clean educational reply", () => {
    const miss = classifyChatMiss({
      userText: "TPMS light is on",
      rawReply:
        "Check cold tire pressure against the door placard. Do not invent PSI.",
    });
    expect(miss).toBeNull();
  });

  it("marks gatesRepaired when gated reply fixes invent", () => {
    const miss = classifyChatMiss({
      userText: "how much oil?",
      rawReply: "Fill with 4.5 qt.",
      gatedReply:
        "Use the fill cap and owner's manual — we will not invent quarts.",
    });
    expect(miss?.dimensions).toContain("invented_specs");
    expect(miss?.gatesRepaired).toBe(true);
  });
});

describe("draftGoldCaseFromMiss", () => {
  it("builds a mergeable gold shape and validates placeholders", () => {
    const miss = classifyChatMiss({
      userText: "brakes feel mushy when I press them",
      rawReply: "Bleed at home and Replace the master cylinder now.",
    });
    expect(miss).not.toBeNull();
    const draft = draftGoldCaseFromMiss(miss!, { idSuffix: "test01" });
    expect(draft.id).toMatch(/^gold_miss_/);
    expect(draft.user_text).toMatch(/mushy/i);
    expect(draft.expect.diy_path_id).toBe("soft_brake");
    expect(draft.expect.do_not_drive).toBe(true);
    const errs = validateGoldCaseDraft(draft);
    expect(errs.some((e) => /HUMAN/.test(e))).toBe(true);

    draft.expect.sample_good =
      "Treat mushy brakes as do-not-drive. Arrange a tow. Do not bleed lines.";
    expect(validateGoldCaseDraft(draft)).toEqual([]);
  });
});

describe("severity", () => {
  it("ranks safety critical", () => {
    expect(severityForDimensions(["safety_stop"])).toBe("critical");
    expect(severityForDimensions(["invented_specs"])).toBe("high");
    expect(severityForDimensions(["citation_miss"])).toBe("medium");
  });
});
