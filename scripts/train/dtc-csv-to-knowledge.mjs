#!/usr/bin/env node
/**
 * Convert DTC definitions CSV → knowledge_base seed JSON.
 *
 * Usage:
 *   node scripts/train/dtc-csv-to-knowledge.mjs
 *   node scripts/train/dtc-csv-to-knowledge.mjs --in=/path/to/DTC_dtc_definitions.csv
 *   node scripts/train/dtc-csv-to-knowledge.mjs --generic-only
 *
 * Then:
 *   npm run seed:dtc:text
 */

import { createReadStream, existsSync, writeFileSync } from "fs";
import { createInterface } from "readline";
import { resolve } from "path";

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const hasFlag = (name) => args.includes(`--${name}`);

const DEFAULT_CANDIDATES = [
  "scripts/data/autodata/DTC_dtc_definitions.csv",
  "/Users/xietian/Desktop/车库天才garage-genius-ai/训练数据/autodata/autodata/Vehicle_DTC_Diagnostic_Trouble_Code_Definitions/DTC_dtc_definitions.csv",
];

function resolveInPath() {
  const explicit = getArg("in", "");
  if (explicit) return resolve(process.cwd(), explicit);
  for (const p of DEFAULT_CANDIDATES) {
    const abs = resolve(process.cwd(), p);
    if (existsSync(abs)) return abs;
  }
  return resolve(process.cwd(), DEFAULT_CANDIDATES[0]);
}

const inPath = resolveInPath();
const outPath = resolve(
  process.cwd(),
  getArg("out", "scripts/data/dtc-knowledge-seed.json"),
);
const genericOnly = hasFlag("generic-only");

const MAKE_MAP = {
  GENERIC: null,
  OTHER: null,
  CHEVY: "Chevrolet",
  CHEVROLET: "Chevrolet",
  GM: "GM",
  GMC: "GMC",
  VOLKSWAGEN: "Volkswagen",
  VW: "Volkswagen",
  MERCEDES: "Mercedes-Benz",
  "MERCEDES-BENZ": "Mercedes-Benz",
  MB: "Mercedes-Benz",
};

const DISCLAIMER =
  "Not professional mechanic advice. Confirm with freeze-frame data and OEM service info for your VIN/market before replacing parts.";

function titleCaseMake(raw) {
  const key = String(raw || "").trim().toUpperCase();
  if (!key) return null;
  if (key in MAKE_MAP) return MAKE_MAP[key];
  return key
    .toLowerCase()
    .split(/[\s_-]+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ""))
    .join(" ");
}

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function typeLabel(type) {
  const t = String(type || "").toUpperCase();
  if (t === "P") return "Powertrain (P-code)";
  if (t === "B") return "Body (B-code)";
  if (t === "C") return "Chassis (C-code)";
  if (t === "U") return "Network / U-code";
  return t ? `${t}-code` : "OBD/manufacturer code";
}

function toSeed(row) {
  const code = String(row.code || "").trim().toUpperCase();
  const manufacturer = String(row.manufacturer || "").trim();
  const description = String(row.description || "").trim();
  if (!code || !description) return null;

  const isGeneric =
    String(row.is_generic || "").trim() === "1" ||
    manufacturer.toUpperCase() === "GENERIC";
  if (genericOnly && !isGeneric) return null;

  const make = titleCaseMake(manufacturer);
  const family = typeLabel(row.type);
  const mfrLabel = isGeneric ? "Generic OBD" : manufacturer || "Manufacturer";

  return {
    title: `DTC ${code}: ${description}${make ? ` (${make})` : " (generic)"}`,
    content: [
      `Diagnostic trouble code ${code} — ${mfrLabel}.`,
      ``,
      `Definition: ${description}`,
      ``,
      `Code family: ${family}.`,
      `Scope: ${isGeneric ? "Generic OBD definition (cross-make baseline)." : `Manufacturer-specific definition for ${make || manufacturer}.`}`,
      ``,
      `DIY path:`,
      `1. Confirm the code is current (not history-only) and capture freeze-frame.`,
      `2. Check related systems for ${code} before replacing expensive parts.`,
      `3. Cross-check OEM service information for your year/make/model/VIN.`,
      ``,
      DISCLAIMER,
    ].join("\n"),
    source: "diagnostics",
    vehicle_make: make,
    vehicle_model: null,
    vehicle_years: null,
    category: "diagnostics",
    metadata: {
      ingest_key: `dtc_${code}_${(manufacturer || "generic").toLowerCase().replace(/\s+/g, "_")}`,
      dtc: code,
      dtc_type: String(row.type || "").toUpperCase() || null,
      is_generic: isGeneric,
      manufacturer_raw: manufacturer || null,
      source_file: row.source_file || null,
      locale: row.locale || "en",
      language: "en",
      corpus: "dtc_definitions",
      rag_tier: "repair",
      region: "US/EU",
    },
    is_active: true,
  };
}

if (!existsSync(inPath)) {
  console.error(`Input not found: ${inPath}`);
  console.error("Pass --in=/path/to/DTC_dtc_definitions.csv");
  process.exit(1);
}

const rl = createInterface({
  input: createReadStream(inPath, { encoding: "utf8" }),
  crlfDelay: Infinity,
});

let headers = null;
const seeds = [];
const seen = new Set();
let skipped = 0;
let lineNo = 0;

for await (const rawLine of rl) {
  lineNo += 1;
  const line = rawLine.replace(/^\uFEFF/, "").trimEnd();
  if (!line) continue;
  const cols = parseCsvLine(line);
  if (!headers) {
    headers = cols.map((h) => h.trim().toLowerCase());
    continue;
  }
  if (cols.length < headers.length) {
    skipped += 1;
    continue;
  }
  const row = {};
  headers.forEach((h, i) => {
    row[h] = cols[i] ?? "";
  });
  const item = toSeed(row);
  if (!item) {
    skipped += 1;
    continue;
  }
  const key = item.metadata.ingest_key;
  if (seen.has(key)) {
    skipped += 1;
    continue;
  }
  seen.add(key);
  seeds.push(item);
}

writeFileSync(outPath, JSON.stringify(seeds, null, 2) + "\n", "utf8");
console.log(
  `Wrote ${seeds.length} DTC knowledge rows → ${outPath} (skipped ${skipped}; lines ${lineNo})`,
);
console.log(`Next: npm run seed:dtc:text`);
