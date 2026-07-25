#!/usr/bin/env node
/**
 * Convert carBrands50 brand list → compact knowledge_base seed JSON.
 *
 * This dataset is image classification (train/val JPGs). Images are NOT ingested.
 * We only keep classname.txt as a make/alias catalog useful for DIY RAG + make matching.
 *
 * Usage:
 *   node scripts/train/car-brands50-to-knowledge.mjs
 *   node scripts/train/car-brands50-to-knowledge.mjs --dir=scripts/data/autodata/carBrands50
 *
 * Then:
 *   npm run seed:car-brands:text
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const dir = resolve(
  process.cwd(),
  getArg("dir", "scripts/data/autodata/carBrands50"),
);
const outPath = resolve(
  process.cwd(),
  getArg("out", "scripts/data/car-brands50-knowledge-seed.json"),
);

/** Display-name overrides for underscores / common OEM spelling. */
const DISPLAY = {
  Alfa_Romeo: "Alfa Romeo",
  Aston_Martin: "Aston Martin",
  Land_Rover: "Land Rover",
  Mercedes_Benz: "Mercedes-Benz",
  Ram_Trucks: "Ram",
  Mini: "MINI",
  Bmw: "BMW",
  BMW: "BMW",
  GMC: "GMC",
  MG: "MG",
};

const ALIASES = {
  Mercedes_Benz: ["Mercedes", "Mercedes Benz", "MB", "Benz"],
  Volkswagen: ["VW", "Volkswagen AG"],
  Land_Rover: ["LandRover", "Range Rover maker Land Rover"],
  Ram_Trucks: ["Ram", "RAM Trucks", "Dodge Ram"],
  Mini: ["Mini Cooper", "MINI Cooper"],
  Chevrolet: ["Chevy", "Chevrolet Motor Division"],
  Citroen: ["Citroën"],
  Infiniti: ["Infinity (misspelling)", "Nissan luxury (Infiniti)"],
  Acura: ["Honda luxury (Acura)"],
  Lexus: ["Toyota luxury (Lexus)"],
  Genesis: ["Hyundai luxury (Genesis)"],
};

function displayName(raw) {
  if (DISPLAY[raw]) return DISPLAY[raw];
  return String(raw).replace(/_/g, " ");
}

function slug(raw) {
  return String(raw)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function brandCard(raw, index) {
  const name = displayName(raw);
  const aliases = ALIASES[raw] || [];
  const aliasLine = aliases.length
    ? `Common aliases: ${aliases.join(", ")}.`
    : `Common alias: ${name}.`;

  return {
    title: `Car brand catalog: ${name}`,
    content: [
      `Vehicle make catalog entry from carBrands50 (label index ${index}).`,
      ``,
      `Canonical make: ${name}`,
      `Dataset label: ${raw}`,
      aliasLine,
      ``,
      `DIY tip: When searching parts or TSBs, use the exact make spelling "${name}" plus year/model/engine. Do not invent luxury-sub-brand swaps (e.g. Acura ≠ Honda parts fitment).`,
      ``,
      `Not professional mechanic advice.`,
    ].join("\n"),
    source: "manual",
    vehicle_make: name,
    vehicle_model: null,
    vehicle_years: null,
    category: "general",
    metadata: {
      ingest_key: `car_brands50_${slug(raw)}`,
      brand_label: raw,
      brand_index: index,
      aliases,
      language: "en",
      corpus: "car_brands50",
      rag_tier: "config",
      region: "global",
      source_label: "carBrands50",
    },
    is_active: true,
  };
}

function catalogDoc(brands) {
  const lines = brands.map((b, i) => `${i}. ${displayName(b)} (${b})`);
  return {
    title: "Supported car brands catalog (carBrands50 — 50 makes)",
    content: [
      "Reference list of 50 passenger-car brands from the carBrands50 image-classification dataset.",
      "Use for make recognition / alias normalization in DIY chat. Images themselves are not stored in knowledge_base.",
      "",
      "Brands:",
      ...lines,
      "",
      "Note: Original pack is image classification (train/val JPGs). Only brand names are ingested here.",
      "Not professional mechanic advice.",
    ].join("\n"),
    source: "manual",
    vehicle_make: null,
    vehicle_model: null,
    vehicle_years: null,
    category: "general",
    metadata: {
      ingest_key: "car_brands50_catalog",
      brand_count: brands.length,
      language: "en",
      corpus: "car_brands50",
      rag_tier: "config",
      region: "global",
      source_label: "carBrands50",
    },
    is_active: true,
  };
}

const classPath = resolve(dir, "classname.txt");
if (!existsSync(classPath)) {
  console.error(`Missing: ${classPath}`);
  process.exit(1);
}

const brands = readFileSync(classPath, "utf8")
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter(Boolean);

if (brands.length === 0) {
  console.error("classname.txt is empty");
  process.exit(1);
}

const seeds = [catalogDoc(brands), ...brands.map((b, i) => brandCard(b, i))];
writeFileSync(outPath, JSON.stringify(seeds, null, 2) + "\n", "utf8");
console.log(
  `Wrote ${seeds.length} carBrands50 knowledge rows → ${outPath} (${brands.length} brands + 1 catalog; images skipped)`,
);
console.log(`Next: npm run seed:car-brands:text`);
