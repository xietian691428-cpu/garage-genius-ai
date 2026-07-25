#!/usr/bin/env node
/**
 * Convert CarRepairQA JSONL → knowledge_base seed JSON.
 *
 * Cleans Chinese DIY Q&A:
 *   - strips <think>...</think> chain-of-thought
 *   - falls back to `context` when output is missing / GENERATION FAILED
 *   - drops empty rows
 *
 * Usage:
 *   node scripts/train/car-repair-qa-to-knowledge.mjs
 *   node scripts/train/car-repair-qa-to-knowledge.mjs --in=/path/to/dataset.jsonl
 *
 * Then:
 *   npm run seed:car-repair-qa:text
 */

import { createReadStream, existsSync, writeFileSync } from "fs";
import { createInterface } from "readline";
import { resolve } from "path";

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const DEFAULT_CANDIDATES = [
  "scripts/data/autodata/CarRepairQA-dataset.jsonl",
  "/Users/xietian/Desktop/车库天才garage-genius-ai/训练数据/autodata/autodata/CarRepairQA/dataset.jsonl",
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
  getArg("out", "scripts/data/car-repair-qa-knowledge-seed.json"),
);

const DISCLAIMER =
  "DIY note: Verify against your market owner's manual and VIN-specific service info. Not professional mechanic advice.";

const CATEGORY_RULES = [
  [/制动|刹车|brake/i, "brake"],
  [/悬架|减震|转向|steering|suspension/i, "suspension"],
  [/电路|电池|点火|传感器|电控|ecu|abs|eps/i, "electrical"],
  [/发动机|机油|点火|涡轮|喷油|冷却|发动机|engine|maf|o2/i, "engine"],
  [/变速|离合器|传动|差速|transmission/i, "engine"],
  [/空调|暖风|hvac|a\/c/i, "electrical"],
  [/诊断|故障码|dtc|obd|mil/i, "diagnostics"],
];

function mapCategory(question, answer) {
  const text = `${question}\n${answer}`;
  for (const [re, cat] of CATEGORY_RULES) {
    if (re.test(text)) return cat;
  }
  return "general";
}

function stripThink(text) {
  const raw = String(text || "");
  const m = raw.match(/<\/think>\s*([\s\S]*)$/i);
  if (m) return m[1].trim();
  return raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

function cleanContext(text) {
  return String(text || "")
    .replace(/^#{1,6}\s*答案\s*/m, "")
    .replace(/^#{1,6}\s*参考[资料内容]*\s*/m, "")
    .trim();
}

function pickAnswer(output, context) {
  let answer = stripThink(output);
  if (!answer || /\[GENERATION FAILED\]/i.test(answer)) {
    answer = cleanContext(context);
  }
  const ctx = cleanContext(context);
  // Prefer richer grounded context when model answer is tiny
  if (ctx && answer && answer.length < 60 && ctx.length > answer.length * 1.5) {
    answer = ctx;
  }
  if (!answer && ctx) answer = ctx;
  return answer.trim();
}

function toSeed(row) {
  const id = String(row.id ?? "").trim();
  const question = String(row.instruction || row.question || "").trim();
  const answer = pickAnswer(row.output, row.context);
  if (!question || !answer) return null;

  const category = mapCategory(question, answer);
  const ingestKey = id
    ? `car_repair_qa_${id}`
    : `car_repair_qa_${question.slice(0, 48)}`;

  return {
    title: question.length > 120 ? `${question.slice(0, 117)}...` : question,
    content: [
      `Car repair Q&A (Chinese corpus; aggregated study notes).`,
      ``,
      `Q: ${question}`,
      ``,
      `A: ${answer}`,
      ``,
      DISCLAIMER,
    ].join("\n"),
    source: "diagnostics",
    vehicle_make: null,
    vehicle_model: null,
    vehicle_years: null,
    category,
    metadata: {
      ingest_key: ingestKey,
      language: "zh",
      corpus: "car_repair_qa",
      rag_tier: "repair",
      region: "global",
      source_label: "CarRepairQA",
    },
    is_active: true,
  };
}

if (!existsSync(inPath)) {
  console.error(`Input not found: ${inPath}`);
  console.error("Pass --in=/path/to/CarRepairQA/dataset.jsonl");
  process.exit(1);
}

const rl = createInterface({
  input: createReadStream(inPath, { encoding: "utf8" }),
  crlfDelay: Infinity,
});

const seeds = [];
const seen = new Set();
let skipped = 0;

for await (const line of rl) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  let row;
  try {
    row = JSON.parse(trimmed);
  } catch (err) {
    console.warn("Skip invalid JSONL:", err.message);
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
  `Wrote ${seeds.length} CarRepairQA knowledge rows → ${outPath} (skipped ${skipped})`,
);
console.log(`Next: npm run seed:car-repair-qa:text`);
