import { describe, expect, it } from "vitest";
import {
  flattenMarkdownTablesForExtract,
  preserveManualTablesAsMarkdown,
  preprocessManualPageText,
} from "@/lib/vehicle-manual-tables";
import { chunkManualPages } from "@/lib/vehicle-manuals";
import { extractOilGuessesFromText } from "@/lib/vehicle-manual-extract";
import { extractManualSpecAllowlist } from "@/lib/vehicle-manuals";
import { applySpecOutputGate } from "@/lib/spec-discipline";
import { buildManualSpecAnchors } from "@/lib/vehicle-manual-frame";

describe("manual table structure", () => {
  it("converts aligned fluid rows to markdown + TABLE_ROWS", () => {
    const page = [
      "Capacities",
      "Engine oil with filter    4.8 qt    0W-16",
      "Coolant                    7.1 L     50/50",
      "Brake fluid                DOT-4",
    ].join("\n");
    const { text, tablesFound } = preserveManualTablesAsMarkdown(page);
    expect(tablesFound).toBeGreaterThanOrEqual(1);
    expect(text).toMatch(/\|/);
    const flat = flattenMarkdownTablesForExtract(text);
    expect(flat).toMatch(/\[TABLE_ROWS\]/);
    expect(flat).toMatch(/Engine oil/i);
    expect(flat).toMatch(/4\.8/);
  });

  it("leaves prose unchanged (low confidence)", () => {
    const prose =
      "Check the engine oil level when the engine is cold. Use the dipstick.";
    const { text, tablesFound, lowConfidence } =
      preserveManualTablesAsMarkdown(prose);
    expect(tablesFound).toBe(0);
    expect(lowConfidence).toBe(true);
    expect(text).toContain("dipstick");
  });

  it("recovers pdf-parse collapsed single-space fluid rows", () => {
    // Real pdf.js extract often collapses column gaps to one space.
    const page = [
      "Capacities and recommended fluids",
      "Engine oil with filter 4.8 qt 0W-16",
      "Coolant 7.1 L Toyota SLLC",
      "Brake fluid DOT-4",
    ].join("\n");
    const { text, tablesFound, lowConfidence } =
      preserveManualTablesAsMarkdown(page);
    expect(tablesFound).toBeGreaterThanOrEqual(1);
    expect(lowConfidence).toBe(false);
    expect(flattenMarkdownTablesForExtract(text)).toMatch(/\[TABLE_ROWS\]/);
    const chunks = chunkManualPages([{ page: 1, text: page }]);
    const content = chunks.map((c) => c.content).join("\n");
    const allow = extractManualSpecAllowlist([
      {
        id: "1",
        manualId: "m",
        pageFrom: 1,
        pageTo: 1,
        heading: "Capacities",
        content,
        rank: 1,
      },
    ]);
    expect(allow.oilCapacity).toMatch(/4\.8/);
    expect(allow.oilViscosity).toMatch(/0W-16/i);
    expect(allow.coolantCapacity).toMatch(/7\.1/);
  });

  it("chunk + extract unlocks oil from table page", () => {
    const pages = [
      {
        page: 12,
        text: [
          "Lubricants and capacities",
          "Engine oil with filter    4.8 qt    0W-16",
          "Coolant                    7.1 L",
        ].join("\n"),
      },
    ];
    const chunks = chunkManualPages(pages);
    expect(chunks.length).toBeGreaterThan(0);
    const content = chunks.map((c) => c.content).join("\n");
    expect(content).toMatch(/4\.8|0W-16|TABLE_ROWS/i);
    const oil = extractOilGuessesFromText(content, {
      heading: "Lubricants",
      pageFrom: 12,
      pageTo: 12,
    });
    expect(
      oil.some((g) => g.field === "viscosity" && /0W-16/i.test(g.value)),
    ).toBe(true);
    expect(
      oil.some((g) => g.field === "capacity" && /4\.8/.test(g.value)),
    ).toBe(true);

    const allow = extractManualSpecAllowlist([
      {
        id: "1",
        manualId: "m",
        pageFrom: 12,
        pageTo: 12,
        heading: "Lubricants",
        content,
        rank: 1,
      },
    ]);
    expect(allow.oilViscosity).toMatch(/0W-16/i);
    expect(allow.oilCapacity).toMatch(/4\.8/);

    const ctx = buildManualSpecAnchors({
      retrievedHits: [
        {
          id: "1",
          manualId: "m",
          pageFrom: 12,
          pageTo: 12,
          heading: "Lubricants",
          content,
          rank: 1,
        },
      ],
      garage: {},
      intent: "fluids_oil",
    });
    expect(
      applySpecOutputGate("Per your manual, use 4.8 qt of 0W-16.", ctx),
    ).toMatch(/4\.8/);
  });

  it("no table → still does not invent capacity", () => {
    const ctx = buildManualSpecAnchors({
      retrievedHits: [],
      garage: {},
    });
    expect(applySpecOutputGate("Fill with 4.8 qt.", ctx)).not.toMatch(/4\.8/);
  });
});

describe("preprocessManualPageText", () => {
  it("is idempotent on markdown tables", () => {
    const md = `| Item | Spec |
| --- | --- |
| Engine oil | 4.8 qt 0W-16 |`;
    const once = preprocessManualPageText(md);
    const twice = preprocessManualPageText(once);
    expect(twice).toMatch(/TABLE_ROWS|Engine oil/i);
  });
});
