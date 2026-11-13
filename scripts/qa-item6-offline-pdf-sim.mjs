/**
 * Offline real-PDF simulation for item 6 (no network / no Chat LLM).
 * Mimics: upload text extract → table preprocess → chunk → allowlist → gate.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);

// Vitest-style TS import via dynamic transpile is heavy; call pdf-parse + tables via node.
const { PDFParse } = await import("pdf-parse");

// Load TS modules through vitest/vite isn't available; duplicate thin checks by importing built paths.
// Use tsx if present, else inline the same pipeline with vehicle-manual-tables via vitest runner.
const files = [
  "tmp/manual-handtest/camry_2018_aligned_capacities_table.pdf",
  "tmp/manual-handtest/camry_2021_oil_excerpt.pdf",
  "tmp/manual-handtest/civic_2020_oil_excerpt.pdf",
  "tmp/manual-handtest/bmw_320i_2019_fluids.pdf",
  "tmp/manual-handtest/scanned_no_text_oil.pdf",
];

const outDir = path.join(process.cwd(), "tmp/item6-qa");
fs.mkdirSync(outDir, { recursive: true });

const results = [];
function record(id, pass, note = "") {
  results.push({ id, pass, note: String(note).slice(0, 500) });
  console.log(`${pass ? "PASS" : "FAIL"} ${id} — ${String(note).slice(0, 200)}`);
}

async function extractPdf(file) {
  const buf = fs.readFileSync(file);
  const parser = new PDFParse({ data: buf });
  try {
    const result = await parser.getText();
    return String(result.text || "").replace(/\n-- \d+ of \d+ --\n?/g, "\n").trim();
  } finally {
    await parser.destroy?.().catch(() => {});
  }
}

// Spawn vitest one-off for pipeline assertions with real PDF text injected
const { spawnSync } = await import("node:child_process");

const texts = {};
for (const f of files) {
  if (!fs.existsSync(f)) {
    record(`PDF_missing_${path.basename(f)}`, false, "missing fixture");
    continue;
  }
  const text = await extractPdf(f);
  texts[f] = text;
  record(
    `PDF_extract_${path.basename(f)}`,
    true,
    `chars=${text.length} head=${JSON.stringify(text.slice(0, 80))}`,
  );
}

fs.writeFileSync(path.join(outDir, "pdf_texts.json"), JSON.stringify(texts, null, 2));

const harness = `
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import {
  preprocessManualPageText,
  preserveManualTablesAsMarkdown,
} from "@/lib/vehicle-manual-tables";
import { chunkManualPages, extractManualSpecAllowlist } from "@/lib/vehicle-manuals";
import { buildManualSpecAnchors } from "@/lib/vehicle-manual-frame";
import { applySpecOutputGate, inventedSpecFailures } from "@/lib/spec-discipline";
import {
  extractVisionSpecCandidates,
  visionSpecShouldDegrade,
} from "@/lib/vision/spec-label-from-vision";
import { formatImageAnalysisBlock } from "@/lib/vision/format-analysis";
import type { ImageAnalysis } from "@/lib/vision/types";

const texts = JSON.parse(fs.readFileSync("tmp/item6-qa/pdf_texts.json", "utf8"));

describe("offline PDF user sim", () => {
  it("aligned table PDF → TABLE_ROWS + unlock 4.8/0W-16", () => {
    const key = Object.keys(texts).find((k) => k.includes("aligned_capacities"));
    expect(key).toBeTruthy();
    const raw = texts[key!];
    expect(raw.length).toBeGreaterThan(40);
    const { tablesFound } = preserveManualTablesAsMarkdown(raw);
    expect(tablesFound).toBeGreaterThanOrEqual(1);
    const chunks = chunkManualPages([{ page: 1, text: raw }]);
    const content = chunks.map((c) => c.content).join("\\n");
    expect(content).toMatch(/TABLE_ROWS|4\\.8/);
    const allow = extractManualSpecAllowlist([{
      id: "1", manualId: "m", pageFrom: 1, pageTo: 1, heading: "Capacities", content, rank: 1,
    }]);
    expect(allow.oilCapacity).toMatch(/4\\.8/);
    expect(allow.oilViscosity).toMatch(/0W-16/i);
    const ctx = buildManualSpecAnchors({
      retrievedHits: [{ id: "1", manualId: "m", pageFrom: 1, pageTo: 1, heading: "Capacities", content, rank: 1 }],
      garage: {},
      intent: "fluids_oil",
    });
    const good = "Per Your manual: 4.8 qt and 0W-16. Not OEM-certified by Garage Genius.";
    expect(inventedSpecFailures(good, ctx)).toEqual([]);
    expect(applySpecOutputGate(good, ctx)).toMatch(/4\\.8/);
  });

  it("prose Camry PDF still unlocks without relying on table detector", () => {
    const key = Object.keys(texts).find((k) => k.includes("camry_2021_oil"));
    const raw = texts[key!];
    const chunks = chunkManualPages([{ page: 1, text: raw }]);
    const content = chunks.map((c) => c.content).join("\\n");
    const allow = extractManualSpecAllowlist([{
      id: "1", manualId: "m", pageFrom: 1, pageTo: 1, heading: "Oil", content, rank: 1,
    }]);
    expect(allow.oilCapacity).toMatch(/4\\.8/);
    expect(allow.oilViscosity).toMatch(/0W-16/i);
  });

  it("scanned no-text PDF → empty / no invent", () => {
    const key = Object.keys(texts).find((k) => k.includes("scanned_no_text"));
    const raw = (texts[key!] || "").trim();
    expect(raw.length).toBeLessThan(40);
    const ctx = buildManualSpecAnchors({ retrievedHits: [], garage: {} });
    expect(applySpecOutputGate("Fill with 4.8 qt.", ctx)).not.toMatch(/4\\.8/);
  });

  it("vision blur degrade still holds in same suite", () => {
    const a: ImageAnalysis = {
      condition: "blurry",
      confidence: 0.2,
      scene: "fluid_cap_label",
      ocr_text: [],
      dtc_codes: [],
      readings: [],
      objects: ["cap"],
      safety_flags: ["none"],
      notes: "blur",
      housing_guess: "unclear",
      housing_confidence: "low",
    };
    expect(visionSpecShouldDegrade(a)).toBe(true);
    expect(extractVisionSpecCandidates(a)).toEqual([]);
    expect(formatImageAnalysisBlock(a, "t")).toMatch(/Degraded|retake|insufficient/i);
  });
});
`;

fs.writeFileSync("tests/_tmp-item6-offline-pdf.test.ts", harness);
const r = spawnSync(
  "npx",
  ["vitest", "run", "tests/_tmp-item6-offline-pdf.test.ts"],
  { encoding: "utf8", cwd: process.cwd() },
);
console.log(r.stdout);
console.error(r.stderr);
record("offline_vitest", r.status === 0, `exit=${r.status}`);
fs.unlinkSync("tests/_tmp-item6-offline-pdf.test.ts");
fs.writeFileSync(path.join(outDir, "offline_results.json"), JSON.stringify(results, null, 2));
process.exit(r.status === 0 && results.every((x) => x.pass) ? 0 : 1);
