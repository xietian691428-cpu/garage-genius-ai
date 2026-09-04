import { describe, expect, it } from "vitest";
import {
  EMPTY_GARAGE_DIY_HEADLINE,
  getUsHighFreqDtcChips,
  US_HIGH_FREQ_DTC_CODES,
} from "@/lib/us-completion-funnel";
import { matchPlaybookForDtc, lookupDtc } from "@/lib/dtc";

describe("US completion funnel", () => {
  it("exposes five already-mapped high-freq codes", () => {
    expect(US_HIGH_FREQ_DTC_CODES).toEqual([
      "P0420",
      "P0300",
      "P0171",
      "P0455",
      "U0100",
    ]);
    const chips = getUsHighFreqDtcChips();
    expect(chips).toHaveLength(5);
    for (const chip of chips) {
      const match = matchPlaybookForDtc(lookupDtc(chip.code));
      expect(chip.playbookSlug).toBe(match.slug);
      expect(chip.prompt).toMatch(chip.code);
    }
  });

  it("empty-garage copy stays English DIY and still requires add-vehicle", () => {
    expect(EMPTY_GARAGE_DIY_HEADLINE).toMatch(/Add this car first/i);
    expect(EMPTY_GARAGE_DIY_HEADLINE).not.toMatch(/[\u4e00-\u9fff]/);
  });
});
