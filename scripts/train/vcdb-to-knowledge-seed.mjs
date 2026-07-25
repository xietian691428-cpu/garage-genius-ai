#!/usr/bin/env node
/**
 * Generate RAG knowledge_seed JSON from VCdb cache (config + DIY repair templates).
 *
 * Usage:
 *   node scripts/train/vcdb-to-knowledge-seed.mjs --count 80
 *   node scripts/train/vcdb-to-knowledge-seed.mjs --count 40 --append
 *
 * Then import:
 *   npm run seed:knowledge:file
 *   # or text-only:
 *   npm run seed:knowledge:file:text
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const SQLITE = path.join(ROOT, "scripts/data/vcdb-cache.sqlite");
const OUT = path.join(ROOT, "scripts/data/vcdb-knowledge-seed.json");

const PRIORITY_MAKES = [
  "Toyota",
  "Honda",
  "Ford",
  "Chevrolet",
  "Nissan",
  "Hyundai",
  "Kia",
  "Subaru",
  "Mazda",
  "Jeep",
  "BMW",
  "Volkswagen",
  "Audi",
  "Lexus",
  "Ram",
  "GMC",
  "Dodge",
];

const DISCLAIMER =
  "Not professional mechanic advice. Verify with the official service manual and a certified technician when unsure.";

/**
 * Knowledge templates for FTS RAG.
 * rag_tier drives prompt priority: config > repair > parts
 */
const KNOWLEDGE_TEMPLATES = [
  {
    category: "general",
    rag_tier: "config",
    title: (id) => `${id} — Authoritative configuration card`,
    body: (p) => `Authoritative Vehicle Configuration (AutoCare VCdb) for DIY fitment:
${p.year} ${p.make} ${p.model}${p.submodel ? ` ${p.submodel}` : ""}
- Engine: ${p.engine || "Not specified"}
- Transmission: ${p.transmission || "Not specified"}
- Drive: ${p.driveType || "Not specified"}
- Brakes: ${p.brakes || "Not specified"}

Common configuration notes:
- Do not assume AWD, hybrid, or a different engine unless the garage profile says so.
- Parts searches must include year/make/model/trim/engine: "${p.year} ${p.make} ${p.model} ${p.submodel || ""} ${p.engine || ""}".
- VCdb VehicleID: ${p.vehicleId ?? "n/a"}.

${DISCLAIMER}`,
  },
  {
    category: "diagnostics",
    rag_tier: "repair",
    title: (id) => `${id} — Typical faults for this configuration`,
    body: (p) => `Typical DIY-relevant issues for ${p.summary}:

Config context: Drive=${p.driveType || "n/a"}, Brakes=${p.brakes || "n/a"}, Engine=${p.engine || "n/a"}.

High-probability symptom paths (adjust to mileage / codes):
1. Brake pedal soft or noise — inspect pads/rotors matching ${p.brakes || "this brake layout"}; bleed if ABS is present.
2. Rough idle / misfire — check plugs, coils, intake leaks for ${p.engine || "this engine"}; scan for pending codes.
3. Battery / no-start — verify 12V health before blaming starters; hybrids need OEM-spec batteries if trim is hybrid.
4. Vibration / pull — tires and alignment first; on ${p.driveType || "this drive"} do not invent transfer-case issues unless Drive is AWD/4WD.

Focus Mode: pick the system that matches symptoms AND this configuration. ${DISCLAIMER}`,
  },
  {
    category: "parts",
    rag_tier: "parts",
    title: (id) => `${id} — Parts fitment precautions`,
    body: (p) => `Parts fitment precautions for ${p.year} ${p.make} ${p.model}${p.submodel ? ` ${p.submodel}` : ""} (${p.engine || "engine TBD"}):

1. Always filter RockAuto / Amazon / AutoZone by exact year + make + model + engine (${p.engine || "confirm under hood"}).
2. Drive type ${p.driveType || "unknown"}: never buy AWD-only hubs, prop shafts, or transfer-case parts if the profile is FWD/RWD-only.
3. Brake kits must match ${p.brakes || "listed brake config"}; ABS vehicles need correct sensor rings / tone wheels.
4. Filters, plugs, and belts are engine-specific — quote "${p.engine}" in the search string.
5. If OEM number is unknown, say verify with VIN / dealer EPC — do not invent part numbers.

Shopping query pattern: "${p.year} ${p.make} ${p.model} ${p.submodel || ""} ${p.engine || ""} <part name>".

${DISCLAIMER}`,
  },
  {
    category: "brake",
    rag_tier: "repair",
    title: (id) => `${id} — Front brake pad DIY checklist`,
    body: (p) => `Vehicle config (AutoCare VCdb): ${p.summary}.
Brake system: ${p.brakes || "see vehicle card"}. Drive: ${p.driveType || "n/a"}.

DIY focus for this configuration:
1. Confirm pad wear indicators and rotor thickness before ordering.
2. Match parts to ${p.year} ${p.make} ${p.model}${p.submodel ? ` ${p.submodel}` : ""} ${p.engine || ""} — avoid "universal" kits when ABS is listed (${/abs/i.test(p.brakes || "") ? "ABS: yes on this profile" : "confirm ABS on profile"}).
3. Tools: jack + stands, lug wrench, C-clamp or caliper tool, torque wrench, brake cleaner.
4. After install: pump pedal until firm; bed-in with 8–10 moderate stops from ~40 mph.
5. Search: "${p.year} ${p.make} ${p.model} ${p.submodel || ""} ${p.engine || ""} front brake pads".

Safety: never work under a vehicle supported only by a jack. ${DISCLAIMER}`,
  },
];

function parseArgs(argv) {
  let count = 12; // vehicles → ~48 knowledge rows with 4 templates
  let append = false;
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--count" && argv[i + 1]) count = Number(argv[++i]) || 12;
    if (argv[i] === "--append") append = true;
  }
  return { count, append };
}

function isJunk(v) {
  return !v || ["-", "N/A", "N/R", "U/K", "Unknown"].includes(String(v).trim());
}

function engineLabel(row) {
  const parts = [];
  const lit = String(row.liter || "").trim();
  const cyl = String(row.cyl || "").trim();
  const block = String(row.block || "").trim();
  const asp = String(row.asp || "").trim();
  const fuel = String(row.fuel || "").trim();
  if (lit && !isJunk(lit)) parts.push(`${lit}L`);
  if (cyl && block && !isJunk(cyl)) parts.push(`${block}${cyl}`);
  else if (cyl && !isJunk(cyl)) parts.push(`${cyl}-cyl`);
  if (asp === "Naturally Aspirated") parts.push("NA");
  else if (asp && !isJunk(asp)) parts.push(asp);
  if (fuel && !isJunk(fuel)) parts.push(fuel);
  return parts.join(" ") || null;
}

function loadPopularProfiles(db, limit) {
  const makeSet = new Set(PRIORITY_MAKES.map((m) => m.toLowerCase()));
  const rows = db
    .prepare(
      `SELECT CAST(v."VehicleID" AS INTEGER) AS vid,
              CAST(bv."YearID" AS INTEGER) AS year,
              mk."MakeName" AS make,
              md."ModelName" AS model,
              sm."SubModelName" AS submodel
       FROM "Vehicle" v
       JOIN "BaseVehicle" bv ON bv."BaseVehicleID" = v."BaseVehicleID"
       JOIN "Make" mk ON mk."MakeID" = bv."MakeID"
       JOIN "Model" md ON md."ModelID" = bv."ModelID"
       LEFT JOIN "SubModel" sm ON sm."SubModelID" = v."SubModelID"
       WHERE CAST(bv."YearID" AS INTEGER) BETWEEN 2012 AND 2024
         AND CAST(md."VehicleTypeID" AS INTEGER) IN (5, 6, 7)
       ORDER BY RANDOM()
       LIMIT ?`,
    )
    .all(limit * 12);

  const picked = [];
  const seen = new Set();
  for (const r of rows) {
    if (!makeSet.has(String(r.make || "").toLowerCase())) continue;
    const key = `${r.year}|${r.make}|${r.model}|${r.submodel || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const eng = db
      .prepare(
        `SELECT eb."Liter" AS liter, eb."Cylinders" AS cyl, eb."BlockType" AS block,
                a."AspirationName" AS asp, f."FuelTypeName" AS fuel
         FROM "VehicleToEngineConfig" vte
         JOIN "EngineConfig" ec ON ec."EngineConfigID" = vte."EngineConfigID"
         LEFT JOIN "EngineBase" eb ON eb."EngineBaseID" = ec."EngineBaseID"
         LEFT JOIN "Aspiration" a ON a."AspirationID" = ec."AspirationID"
         LEFT JOIN "FuelType" f ON f."FuelTypeID" = ec."FuelTypeID"
         WHERE CAST(vte."VehicleID" AS INTEGER) = ?
         LIMIT 1`,
      )
      .get(r.vid);

    const drive = db
      .prepare(
        `SELECT d."DriveTypeName" AS name
         FROM "VehicleToDriveType" vtd
         JOIN "DriveType" d ON d."DriveTypeID" = vtd."DriveTypeID"
         WHERE CAST(vtd."VehicleID" AS INTEGER) = ?
         LIMIT 1`,
      )
      .get(r.vid);

    const trans = db
      .prepare(
        `SELECT tt."TransmissionTypeName" AS typ,
                tn."TransmissionNumSpeeds" AS spd,
                tc."TransmissionControlTypeName" AS ctrl
         FROM "VehicleToTransmission" vtt
         JOIN "Transmission" t ON t."TransmissionID" = vtt."TransmissionID"
         LEFT JOIN "TransmissionBase" tb ON tb."TransmissionBaseID" = t."TransmissionBaseID"
         LEFT JOIN "TransmissionType" tt ON tt."TransmissionTypeID" = tb."TransmissionTypeID"
         LEFT JOIN "TransmissionNumSpeeds" tn ON tn."TransmissionNumSpeedsID" = tb."TransmissionNumSpeedsID"
         LEFT JOIN "TransmissionControlType" tc ON tc."TransmissionControlTypeID" = tb."TransmissionControlTypeID"
         WHERE CAST(vtt."VehicleID" AS INTEGER) = ?
         LIMIT 1`,
      )
      .get(r.vid);

    const brake = db
      .prepare(
        `SELECT bt1."BrakeTypeName" AS front, bt2."BrakeTypeName" AS rear, ba."BrakeABSName" AS abs
         FROM "VehicleToBrakeConfig" vtb
         JOIN "BrakeConfig" bc ON bc."BrakeConfigID" = vtb."BrakeConfigID"
         LEFT JOIN "BrakeType" bt1 ON bt1."BrakeTypeID" = bc."FrontBrakeTypeID"
         LEFT JOIN "BrakeType" bt2 ON bt2."BrakeTypeID" = bc."RearBrakeTypeID"
         LEFT JOIN "BrakeABS" ba ON ba."BrakeABSID" = bc."BrakeABSID"
         WHERE CAST(vtb."VehicleID" AS INTEGER) = ?
         LIMIT 1`,
      )
      .get(r.vid);

    const engine = eng ? engineLabel(eng) : null;
    const transmission = [trans?.spd, trans?.typ, trans?.ctrl]
      .map((x) => String(x || "").trim())
      .filter((s) => s && !isJunk(s))
      .join(" ");
    const brakes = [
      brake?.front && !isJunk(brake.front) ? `front ${brake.front}` : null,
      brake?.rear && !isJunk(brake.rear) ? `rear ${brake.rear}` : null,
      brake?.abs && !isJunk(brake.abs) ? `ABS: ${brake.abs}` : null,
    ]
      .filter(Boolean)
      .join(", ");

    const driveType =
      drive?.name && !isJunk(drive.name) ? String(drive.name) : null;

    // Skip incomplete configs — poor RAG quality
    if (!engine || !driveType) continue;

    const profile = {
      vehicleId: Number(r.vid),
      year: Number(r.year),
      make: String(r.make),
      model: String(r.model),
      submodel: r.submodel ? String(r.submodel) : null,
      engine,
      transmission: transmission || null,
      driveType,
      brakes: brakes || null,
    };
    profile.summary = [
      `${profile.year} ${profile.make} ${profile.model}${profile.submodel ? ` ${profile.submodel}` : ""}`,
      profile.engine,
      profile.transmission,
      profile.driveType,
      profile.brakes,
    ]
      .filter(Boolean)
      .join(" · ");

    picked.push(profile);
    if (picked.length >= limit) break;
  }
  return picked;
}

function toSeedItems(profiles) {
  const items = [];
  for (const p of profiles) {
    const id = `${p.year} ${p.make} ${p.model}${p.submodel ? ` ${p.submodel}` : ""}`;
    for (const tmpl of KNOWLEDGE_TEMPLATES) {
      items.push({
        title: tmpl.title(id),
        content: tmpl.body(p),
        source: "vcdb_config",
        vehicle_make: p.make,
        vehicle_model: p.model,
        vehicle_years: String(p.year),
        category: tmpl.category,
        metadata: {
          region: "US/EU",
          vcdb_vehicle_id: p.vehicleId,
          engine: p.engine,
          drive: p.driveType,
          rag_tier: tmpl.rag_tier,
          generated: true,
        },
        is_active: true,
      });
    }
  }
  return items;
}

function main() {
  const { count, append } = parseArgs(process.argv);
  if (!fs.existsSync(SQLITE)) {
    console.error("Missing SQLite cache:", SQLITE);
    process.exit(1);
  }

  const db = new DatabaseSync(SQLITE, { readOnly: true });
  const profiles = loadPopularProfiles(db, count);
  const generated = toSeedItems(profiles);

  let items = generated;
  if (append && fs.existsSync(OUT)) {
    const prev = JSON.parse(fs.readFileSync(OUT, "utf8"));
    const prevArr = Array.isArray(prev) ? prev : prev.items || [];
    const seen = new Set(prevArr.map((x) => x.title));
    const merged = [...prevArr];
    for (const item of generated) {
      if (!seen.has(item.title)) {
        merged.push(item);
        seen.add(item.title);
      }
    }
    items = merged;
  }

  fs.writeFileSync(OUT, JSON.stringify(items, null, 2));
  console.log(
    `Wrote ${items.length} knowledge items (${generated.length} new from ${profiles.length} vehicles) → ${OUT}`,
  );
  console.log(
    "Import with: npm run seed:knowledge -- --file=scripts/data/vcdb-knowledge-seed.json --file-only",
  );
}

main();
