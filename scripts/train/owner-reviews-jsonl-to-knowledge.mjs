#!/usr/bin/env node
/**
 * Convert owner-review JSONL → knowledge_base seed JSON (English corpus).
 *
 * Input line shape (preferred English; non-English should be translated before seed):
 *   { id, brand, model, year_range, category, question, answer, source, ... }
 *
 * Usage:
 *   node scripts/train/owner-reviews-jsonl-to-knowledge.mjs
 *   node scripts/train/owner-reviews-jsonl-to-knowledge.mjs --in=scripts/data/owner-reviews.jsonl --out=scripts/data/owner-reviews-knowledge-seed.json
 *
 * Then:
 *   npm run seed:owner-reviews
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const inPath = resolve(
  process.cwd(),
  getArg("in", "scripts/data/owner-reviews.jsonl"),
);
const outPath = resolve(
  process.cwd(),
  getArg("out", "scripts/data/owner-reviews-knowledge-seed.json"),
);

/** Map review categories → knowledge_base categories used by RAG Focus */
const CATEGORY_MAP = {
  fuel_economy: "engine",
  油耗: "engine",
  reliability: "diagnostics",
  可靠性: "diagnostics",
  comfort: "general",
  舒适: "general",
  空间舒适: "general",
  space: "general",
  空间: "general",
  powertrain: "engine",
  动力: "engine",
  interior: "general",
  内饰: "general",
  maintenance: "general",
  保养: "general",
  driving: "general",
  驾驶: "general",
  safety: "general",
  安全: "general",
  value: "general",
  价格: "general",
  buying_advice: "general",
  购车建议: "general",
  offroad: "general",
  "off-road": "general",
  越野: "general",
  luxury: "general",
  豪华: "general",
  practicality: "general",
  实用: "general",
  performance: "engine",
  性能: "engine",
  handling: "general",
  操控: "general",
};

function mapCategory(raw) {
  if (!raw) return "general";
  const key = String(raw).trim();
  return CATEGORY_MAP[key] || CATEGORY_MAP[key.toLowerCase()] || "general";
}

function toSeed(row) {
  const id = String(row.id || "").trim();
  const brand = String(row.brand || "").trim();
  const model = String(row.model || "").trim();
  const years = String(row.year_range || row.years || "").trim();
  const question = String(row.question || row.title || "").trim();
  const answer = String(row.answer || row.content || "").trim();
  if (!question || !answer) return null;

  const market = String(row.market || "US").trim() || "US";
  const title = `${years ? years + " " : ""}${brand} ${model}: ${question}`.trim();

  return {
    title,
    content: [
      `Owner-review Q&A (aggregated; not a substitute for official TSBs).`,
      ``,
      `Q: ${question}`,
      ``,
      `A: ${answer}`,
      ``,
      `DIY note: Verify against your market owner's manual and VIN-specific service info. Not professional mechanic advice.`,
    ].join("\n"),
    source: "user_feedback",
    vehicle_make: brand || null,
    vehicle_model: model || null,
    vehicle_years: years || null,
    category: mapCategory(row.category),
    metadata: {
      ingest_key: id || `owner_review_${brand}_${model}_${question.slice(0, 40)}`,
      review_category: row.category || null,
      sentiment: row.sentiment || null,
      upvotes: row.upvotes ?? null,
      keywords: Array.isArray(row.keywords) ? row.keywords : [],
      source_label: row.source || null,
      source_url: row.source_url || null,
      date: row.date || null,
      market,
      region: market === "EU" || market === "GB" ? "EU" : "US",
      language: "en",
      corpus: "owner_reviews",
    },
    is_active: true,
  };
}

if (!existsSync(inPath)) {
  console.error(`Input not found: ${inPath}`);
  process.exit(1);
}

const lines = readFileSync(inPath, "utf8")
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#"));

const seeds = [];
const seen = new Set();
let skipped = 0;

for (const line of lines) {
  let row;
  try {
    row = JSON.parse(line);
  } catch (err) {
    console.warn("Skip invalid JSONL line:", err.message);
    skipped += 1;
    continue;
  }
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
  `Wrote ${seeds.length} knowledge rows → ${outPath} (skipped ${skipped})`,
);
console.log(`Next: npm run seed:owner-reviews`);
