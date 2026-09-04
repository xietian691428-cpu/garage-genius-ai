import { describe, expect, it } from "vitest";
import {
  extractDtcCodes,
  extractDtcCodesFromAny,
  isValidDtcInput,
  normalizeDtcCode,
} from "@/lib/dtc-parse";
import {
  formatDtcRefBlock,
  localDtcCatalogSize,
  lookupLocalDtc,
  sortDtcRefsForPrompt,
} from "@/lib/vehicle-data/dtc-local";
import { mergeDtcAnchors } from "@/lib/vision/format-analysis";
import type { ImageAnalysis } from "@/lib/vision/types";

const SAMPLE_CODES = [
  "P0300",
  "P0301",
  "P0308",
  "P0171",
  "P0174",
  "P0420",
  "P0430",
  "P0401",
  "P0128",
  "P0455",
  "P0456",
  "P0113",
  "P0500",
  "P0700",
  "P0121",
  "P0122",
  "P0123",
  "P0335",
  "P0340",
  "P0442",
  "P0496",
  "P0520",
  "P0523",
  "P0562",
  "P0627",
  "P0011",
  "P0138",
  "P0325",
  "P0351",
  "P0440",
  "P0446",
  "P0506",
  "P0606",
  "P2111",
  "P2195",
  "P0010",
  "P0016",
  "P2096",
  "P2135",
  "P0A80",
  "U0073",
  "C0036",
  "U0100",
  "U0101",
  "C0035",
  "B0028",
] as const;

describe("local DTC catalog + parser", () => {
  it("loads at least 20 merged catalog entries", () => {
    expect(localDtcCatalogSize()).toBeGreaterThanOrEqual(20);
  });

  it("looks up 20+ high-frequency codes with title, summary, and diy_level", () => {
    expect(SAMPLE_CODES.length).toBeGreaterThanOrEqual(20);
    for (const code of SAMPLE_CODES) {
      const hit = lookupLocalDtc(code);
      expect(hit.catalogHit, code).toBe(true);
      expect(hit.code).toBe(code);
      expect(hit.title.length).toBeGreaterThan(8);
      expect(hit.summary.length).toBeGreaterThan(20);
      expect(["observe", "basic", "advanced", "shop"]).toContain(hit.diyLevel);
      expect(hit.title).not.toMatch(/must replace|replace now|torque/i);
      expect(hit.summary).not.toMatch(/must replace|replace now|torque/i);
    }
  });

  it("injects [DTC_REF] with title, summary, and diy_level for sampled codes", () => {
    const blob = "P0300 P0171 P0420 P0455 U0100 P0335 P0520";
    const block = formatDtcRefBlock(blob);
    expect(block).toMatch(/\[DTC_REF\]/);
    expect(block).toMatch(/diy_level:/);
    expect(block).toMatch(/P0300/);
    expect(block).toMatch(/P0171/);
    expect(block).toMatch(/P0420/);
    expect(block).toMatch(/P0455/);
    expect(block).toMatch(/U0100/);
    expect(block).not.toMatch(/must replace|replace now/i);
  });

  it("parses case, spaces, dashes, and multi-code blobs the same way", () => {
    expect(normalizeDtcCode("p0420")).toBe("P0420");
    expect(normalizeDtcCode("P 0420")).toBe("P0420");
    expect(normalizeDtcCode("P-0420")).toBe("P0420");
    expect(isValidDtcInput("P 0420")).toBe(true);
    expect(extractDtcCodes("CEL p0420 and P 0171 / U0100")).toEqual([
      "P0420",
      "P0171",
      "U0100",
    ]);
    expect(extractDtcCodesFromAny(["p0420", "P-0171", "not-a-code"])).toEqual([
      "P0420",
      "P0171",
    ]);
    expect(
      extractDtcCodesFromAny(
        JSON.stringify({ dtc_codes: ["p0420", "U 0100"] }),
      ),
    ).toEqual(["P0420", "U0100"]);
  });

  it("does not invent a definition for unknown codes", () => {
    const unknown = lookupLocalDtc("P9999");
    expect(unknown.catalogHit).toBe(false);
    expect(unknown.diyLevel).toBe("shop");
    expect(unknown.title).toMatch(/Unknown diagnostic trouble code/i);
    expect(unknown.title).toMatch(/OEM definition/i);
    expect(unknown.summary).toMatch(/will not invent/i);
    expect(unknown.summary).toMatch(/record this code/i);
    expect(unknown.title).not.toMatch(/catalyst|misfire|lean/i);

    const block = formatDtcRefBlock("Scanner shows P9999");
    expect(block).toMatch(/\[DTC_REF\]/);
    expect(block).toMatch(/P9999/);
    expect(block).toMatch(/generic family/i);
    expect(block).toMatch(/diy_level=shop/i);
    expect(block).not.toMatch(/catalyst efficiency/i);
  });

  it("lists safety-related codes before pure emissions in [DTC_REF]", () => {
    const block = formatDtcRefBlock("B0028 P0420 C0035");
    expect(block).toMatch(/\[DTC_REF\]/);
    const b = block!.indexOf("B0028");
    const c = block!.indexOf("C0035");
    const p = block!.indexOf("P0420");
    expect(b).toBeGreaterThan(-1);
    expect(c).toBeGreaterThan(-1);
    expect(p).toBeGreaterThan(-1);
    expect(b).toBeLessThan(c);
    expect(c).toBeLessThan(p);
    const ordered = sortDtcRefsForPrompt([
      lookupLocalDtc("P0420"),
      lookupLocalDtc("C0035"),
      lookupLocalDtc("B0028"),
    ]).map((r) => r.code);
    expect(ordered).toEqual(["B0028", "C0035", "P0420"]);
  });

  it("merges chat text and IMAGE_ANALYSIS.dtc_codes through the same lookup", () => {
    const analysis = {
      condition: "clear",
      confidence: 0.9,
      scene: "obd_screen",
      ocr_text: ["P 0455"],
      dtc_codes: ["u0100"],
      readings: [],
      objects: [],
      safety_flags: ["none"],
      notes: "OBD screen",
    } satisfies ImageAnalysis;
    const block = mergeDtcAnchors("Also seeing p0420", analysis);
    expect(block).toMatch(/P0420/);
    expect(block).toMatch(/P0455/);
    expect(block).toMatch(/U0100/);
    expect(block).toMatch(/diy_level:/);
  });
});
