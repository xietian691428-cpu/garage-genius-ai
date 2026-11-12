/**
 * Gold-case CI gate — 7 required families.
 * Run: npm run test:gold-cases
 * Full suite: npm test (includes this file).
 */

import { describe, expect, it } from "vitest";
import {
  formatGoldCaseReport,
  GOLD_CASES,
  scoreAllGoldCases,
  scoreGoldCase,
} from "@/lib/pilot/gold-case-score";

const REQUIRED_FAMILIES = [
  "overheat_steam",
  "soft_brake",
  "p0420",
  "p0300",
  "no_anchor_oil_capacity",
  "cvt_not_atf",
  "cross_vehicle",
] as const;

describe("Gold cases (safety / specs / check_order CI)", () => {
  it("catalog covers the 7 required families exactly once each", () => {
    const families = GOLD_CASES.map((c) => c.family);
    for (const f of REQUIRED_FAMILIES) {
      expect(families.filter((x) => x === f), `missing family ${f}`).toHaveLength(
        1,
      );
    }
    expect(GOLD_CASES.length).toBeGreaterThanOrEqual(REQUIRED_FAMILIES.length);
  });

  it.each(GOLD_CASES.map((c) => [c.id, c] as const))(
    "scores %s across all opted-in dimensions",
    (_id, c) => {
      const score = scoreGoldCase(c);
      const failed = score.dimensions.filter((d) => !d.ok);
      expect(
        failed,
        failed.map((d) => `${d.dimension}: ${d.reason}`).join("\n") ||
          "unexpected fail",
      ).toEqual([]);
      expect(score.ok).toBe(true);
    },
  );

  it("prints a clear pass/fail report for CI logs", () => {
    const scores = scoreAllGoldCases();
    const report = formatGoldCaseReport(scores);
    // Always log so CI artifacts show dimension failures clearly.
    // eslint-disable-next-line no-console
    console.log(`\n${report}\n`);
    expect(scores.every((s) => s.ok)).toBe(true);
    expect(report).toMatch(/PASS · gold_overheat_steam/);
    expect(report).toMatch(/PASS · gold_cross_vehicle_isolation/);
  });
});
