#!/usr/bin/env node
/**
 * AutoCare VCdb → DeepSeek fine-tune JSONL (Node.js)
 *
 * Reads the SQLite cache produced by scripts/train/vcdb_sql_to_jsonl.py
 * (or builds profiles via sqlite3 CLI) and writes DeepSeek chat JSONL:
 *
 *   {"messages":[{"role":"system",...},{"role":"user",...},{"role":"assistant",...}]}
 *
 * Sample types:
 *   - vehicle_identity / config_query
 *   - parts_fitment (config-grounded; no fake OEM)
 *   - fault_diagnosis
 *   - repair_guidance
 *
 * Usage:
 *   node scripts/train/vcdb-to-deepseek-jsonl.mjs --count 500
 *   node scripts/train/vcdb-to-deepseek-jsonl.mjs --count 200 --append
 *   node scripts/train/vcdb-to-deepseek-jsonl.mjs --analyze
 *
 * Requires: Node ≥ 22 (node:sqlite) and scripts/data/vcdb-cache.sqlite
 * Build cache first:
 *   python3 scripts/train/vcdb_sql_to_jsonl.py --sql ".../AutoCare_VCdb_....sql" --limit 100
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { DEEPSEEK_FINETUNE_SYSTEM_PROMPT } from "./deepseek-finetune-system-prompt.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

const DISCLAIMER =
  "⚠️ This is AI-generated information for reference only. Not professional mechanic advice. Always consult a certified technician and follow your vehicle's official manual.";

const PRIORITY_MAKES = new Set([
  "toyota",
  "honda",
  "ford",
  "chevrolet",
  "nissan",
  "hyundai",
  "kia",
  "subaru",
  "mazda",
  "jeep",
  "ram",
  "gmc",
  "bmw",
  "volkswagen",
  "audi",
  "lexus",
  "acura",
  "dodge",
  "buick",
]);

const PART_SCENARIOS = [
  {
    part: "front brake pads",
    focus: "brakes",
    category: "brakes",
    brands: ["OEM Toyota/Honda/Ford (dealer)", "Bosch", "Akebono", "Wagner"],
    price: "$35–$90 per axle set",
  },
  {
    part: "engine oil filter",
    focus: "engine",
    category: "engine",
    brands: ["OEM", "Mobil 1", "Purolator", "Fram Ultra"],
    price: "$6–$18",
  },
  {
    part: "cabin air filter",
    focus: "hvac",
    category: "hvac",
    brands: ["OEM", "ATP", "EPAuto", "Bosch"],
    price: "$12–$35",
  },
  {
    part: "spark plugs",
    focus: "engine",
    category: "engine",
    brands: ["OEM (NGK/Denso often)", "NGK Laser Iridium", "Denso"],
    price: "$8–$25 each",
  },
  {
    part: "12V battery",
    focus: "battery",
    category: "electrical",
    brands: ["OEM group size", "Interstate", "DieHard", "Odyssey"],
    price: "$120–$280",
  },
  {
    part: "front strut / shock",
    focus: "suspension",
    category: "suspension",
    brands: ["OEM", "Monroe", "KYB", "Bilstein"],
    price: "$80–$250 each",
  },
];

const FAULT_SCENARIOS = [
  {
    symptom: "spongy or soft brake pedal",
    focus: "brakes",
    causes: [
      { cause: "Air in hydraulic lines / recent pad job not bled", p: 40 },
      { cause: "Brake fluid leak (caliper, hose, master cylinder)", p: 30 },
      { cause: "Failing master cylinder internal seals", p: 20 },
      { cause: "Warped pads/contaminated fluid (less common alone)", p: 10 },
    ],
    firstChecks: [
      "Check reservoir level and fluid color (should be clear/amber, not dark)",
      "Look under the car for wet spots at wheels and along brake lines",
      "With engine off, pump pedal — does it go firm then sink with engine on?",
    ],
  },
  {
    symptom: "rough idle when warm, especially with A/C on",
    focus: "engine",
    causes: [
      { cause: "Vacuum leak or dirty throttle body", p: 35 },
      { cause: "Misfire (coil, plug, injector) on one cylinder", p: 30 },
      { cause: "MAF contamination / intake restriction", p: 20 },
      { cause: "Fuel pressure or PCV related idle control", p: 15 },
    ],
    firstChecks: [
      "Scan for misfire or fuel-trim codes if you have an OBD reader",
      "Note cold vs hot, and whether A/C load makes it worse",
      "Listen for hissing around the intake boot",
    ],
  },
  {
    symptom: "A/C blows warm air",
    focus: "hvac",
    causes: [
      { cause: "Low refrigerant from a slow leak", p: 40 },
      { cause: "Clogged cabin filter / weak blower", p: 20 },
      { cause: "Compressor clutch not engaging", p: 25 },
      { cause: "Blend door or condenser airflow issue", p: 15 },
    ],
    firstChecks: [
      "Confirm blower and vent mode work",
      "After 5 minutes on Max A/C, feel high/low pressure lines at the firewall (careful — metal can be hot/cold)",
      "Check cabin filter and clear debris from the condenser in front of the radiator",
    ],
  },
  {
    symptom: "slow crank or clicking on start",
    focus: "battery",
    causes: [
      { cause: "Weak battery or poor terminal connection", p: 50 },
      { cause: "Failing starter drawing excess current", p: 25 },
      { cause: "Alternator not charging (battery drained)", p: 15 },
      { cause: "Ground strap / chassis ground corrosion", p: 10 },
    ],
    firstChecks: [
      "Measure resting battery voltage (healthy ~12.6V+)",
      "Clean and tighten both battery terminals",
      "Headlights bright when cranking? Dim lights point to battery/connections",
    ],
  },
  {
    symptom: "clunk over bumps from the front end",
    focus: "suspension",
    causes: [
      { cause: "Worn sway bar end links or bushings", p: 35 },
      { cause: "Strut mount / bearing wear", p: 25 },
      { cause: "Ball joint or control arm bushing play", p: 25 },
      { cause: "Loose brake caliper hardware (less common)", p: 15 },
    ],
    firstChecks: [
      "Push down each front corner — listen for clunks and watch excess bounce",
      "With the wheel turned, visually check end links and strut boots",
      "Note if the noise is left, right, or both sides",
    ],
  },
  {
    symptom: "hesitation on acceleration / transmission flare",
    focus: "transmission",
    causes: [
      { cause: "Low or burnt transmission fluid (if serviceable)", p: 30 },
      { cause: "Software/shift adaptation or solenoid issue", p: 25 },
      { cause: "Engine misfire misread as transmission slip", p: 25 },
      { cause: "Mount wear causing harsh engagement feel", p: 20 },
    ],
    firstChecks: [
      "Confirm whether it is engine stumble vs gear slip (RPM flare without speed rise)",
      "Check for engine misfire codes first",
      "Note fluid level/condition if your unit has a dipstick",
    ],
  },
];

const REPAIR_JOBS = [
  {
    job: "replace front brake pads",
    focus: "brakes",
    difficulty: "Medium",
    time: "1.5–3 hours",
    tools: ["Jack + jack stands", "Lug wrench", "C-clamp or caliper tool", "Brake cleaner", "Torque wrench"],
    steps: [
      "Park on level ground, chock rear wheels, loosen lug nuts slightly",
      "Jack the corner, set jack stands, remove the wheel",
      "Remove caliper slide bolts, hang caliper — do not let it dangle by the hose",
      "Compress the piston slowly, install new pads/shims with correct orientation",
      "Reassemble, torque lugs to spec, pump the pedal until firm before driving",
    ],
  },
  {
    job: "change engine oil and filter",
    focus: "engine",
    difficulty: "Easy",
    time: "45–90 minutes",
    tools: ["Oil filter wrench", "Drain pan", "Funnel", "Gloves", "Correct viscosity oil"],
    steps: [
      "Warm engine 2–3 minutes, then shut off — oil flows better warm, not scalding hot",
      "Raise safely if needed, remove drain plug, drain into pan",
      "Replace crush washer if used, reinstall plug to spec",
      "Swap oil filter (oil the gasket), refill with the correct capacity for your engine",
      "Start, check for leaks, re-check level on a level surface",
    ],
  },
  {
    job: "replace cabin air filter",
    focus: "hvac",
    difficulty: "Easy",
    time: "15–40 minutes",
    tools: ["Screwdriver or trim tool (model-dependent)", "Gloves", "Flashlight"],
    steps: [
      "Locate the cabin filter door (often behind glove box or under cowl)",
      "Note airflow arrow on the old filter before removal",
      "Vacuum leaves/debris from the housing",
      "Install new filter with arrow pointing the correct direction",
      "Reassemble glove box / cover and test blower speeds",
    ],
  },
  {
    job: "replace a 12V battery",
    focus: "battery",
    difficulty: "Easy–Medium",
    time: "30–60 minutes",
    tools: ["10mm wrench (typical)", "Terminal cleaner", "Memory saver optional"],
    steps: [
      "Confirm group size and CCA match your vehicle",
      "Disconnect NEGATIVE first, then positive",
      "Swap hold-down, clean tray and terminals",
      "Connect positive first, then negative — snug, not crushed",
      "Start and verify charging voltage ~13.5–14.7V with engine running",
    ],
  },
];

// ── CLI ────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {
    sqlite: path.join(ROOT, "scripts/data/vcdb-cache.sqlite"),
    out: path.join(ROOT, "scripts/data/deepseek-finetune.jsonl"),
    count: 500,
    vehicles: 1200,
    seed: 42,
    append: false,
    analyze: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--append") args.append = true;
    else if (a === "--analyze") args.analyze = true;
    else if (a === "--count") args.count = Number(argv[++i]);
    else if (a === "--vehicles") args.vehicles = Number(argv[++i]);
    else if (a === "--seed") args.seed = Number(argv[++i]);
    else if (a === "--sqlite") args.sqlite = path.resolve(argv[++i]);
    else if (a === "--out") args.out = path.resolve(argv[++i]);
    else if (a === "--help" || a === "-h") {
      console.log(`Usage: node scripts/train/vcdb-to-deepseek-jsonl.mjs [options]
  --sqlite PATH   VCdb SQLite cache (default scripts/data/vcdb-cache.sqlite)
  --out PATH      Output JSONL
  --count N       Samples to write (default 500)
  --vehicles N    Vehicle profiles to sample (default 1200)
  --seed N        RNG seed
  --append        Append to existing JSONL (dedupe by hash)
  --analyze       Print schema / key field summary and exit`);
      process.exit(0);
    }
  }
  return args;
}

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function cleanList(items, limit = 8) {
  const out = [];
  for (const x of items || []) {
    const s = String(x || "").trim();
    if (!s || out.includes(s)) continue;
    out.push(s);
    if (out.length >= limit) break;
  }
  return out;
}

function labelOf(p) {
  const bits = [String(p.year), p.make, p.model];
  if (p.submodel && !["-", "N/A", "N/R", "U/K"].includes(p.submodel)) {
    bits.push(p.submodel);
  }
  return bits.join(" ");
}

function hashRecord(messages) {
  const payload = messages.map((m) => `${m.role}:${m.content}`).join("\n");
  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

function makeExample(user, assistant, meta) {
  const messages = [
    { role: "system", content: DEEPSEEK_FINETUNE_SYSTEM_PROMPT },
    { role: "user", content: user.trim() },
    { role: "assistant", content: assistant.trim() },
  ];
  return {
    messages,
    metadata: meta,
    id: hashRecord(messages),
  };
}

// ── Analyze ────────────────────────────────────────────────────────

function analyze(db) {
  const tables = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
    .all()
    .map((r) => r.name);

  console.log("=== VCdb SQLite key fields (for fine-tune grounding) ===\n");
  console.log(`Tables in cache: ${tables.length}`);
  console.log(
    "Key identity: YearID, Make.MakeName, Model.ModelName, SubModel.SubModelName, Vehicle/BaseVehicle",
  );
  console.log(
    "Key config: EngineConfig→EngineBase(Liter,Cylinders,BlockType), Aspiration, FuelType",
  );
  console.log(
    "Key driveline: Transmission*, DriveType, BrakeConfig (front/rear/ABS)",
  );
  console.log(
    "Note: No OEM / brand / price tables — this is VCdb, not PCdb.\n",
  );

  const counts = {};
  for (const t of [
    "Vehicle",
    "BaseVehicle",
    "Make",
    "Model",
    "EngineConfig",
    "VehicleToEngineConfig",
  ]) {
    if (!tables.includes(t)) continue;
    counts[t] = db.prepare(`SELECT COUNT(*) AS c FROM "${t}"`).get().c;
  }
  console.log("Row counts:", counts);
}

// ── Load profiles ──────────────────────────────────────────────────

function loadLookup(db, table, idCol, nameCol) {
  const map = new Map();
  try {
    for (const row of db.prepare(`SELECT "${idCol}" AS id, "${nameCol}" AS name FROM "${table}"`).all()) {
      const id = Number(row.id);
      if (!Number.isFinite(id)) continue;
      map.set(id, String(row.name || "").trim());
    }
  } catch {
    /* table missing */
  }
  return map;
}

function buildProfiles(db, maxVehicles, seed) {
  const rng = mulberry32(seed);
  const makes = loadLookup(db, "Make", "MakeID", "MakeName");
  const submodels = loadLookup(db, "SubModel", "SubModelID", "SubModelName");
  const vtypes = loadLookup(db, "VehicleType", "VehicleTypeID", "VehicleTypeName");
  const regions = loadLookup(db, "Region", "RegionID", "RegionName");
  const drive = loadLookup(db, "DriveType", "DriveTypeID", "DriveTypeName");
  const aspiration = loadLookup(db, "Aspiration", "AspirationID", "AspirationName");
  const fuel = loadLookup(db, "FuelType", "FuelTypeID", "FuelTypeName");
  const brakeType = loadLookup(db, "BrakeType", "BrakeTypeID", "BrakeTypeName");
  const brakeAbs = loadLookup(db, "BrakeABS", "BrakeABSID", "BrakeABSName");

  const models = new Map();
  for (const row of db
    .prepare(`SELECT "ModelID" AS id, "ModelName" AS name, "VehicleTypeID" AS vt FROM "Model"`)
    .all()) {
    models.set(Number(row.id), {
      name: String(row.name || "").trim(),
      vt: row.vt != null ? Number(row.vt) : null,
    });
  }

  const engineCfg = new Map();
  for (const row of db
    .prepare(
      `SELECT ec."EngineConfigID" AS id, eb."Liter" AS liter, eb."Cylinders" AS cyl,
              eb."BlockType" AS block, ec."AspirationID" AS asp, ec."FuelTypeID" AS fuel
       FROM "EngineConfig" ec
       LEFT JOIN "EngineBase" eb ON eb."EngineBaseID" = ec."EngineBaseID"`,
    )
    .all()) {
    const parts = [];
    const lit = String(row.liter || "").trim();
    const cyl = String(row.cyl || "").trim();
    const block = String(row.block || "").trim();
    const asp = aspiration.get(Number(row.asp)) || "";
    const ft = fuel.get(Number(row.fuel)) || "";
    if (lit && !["-", "N/A", "N/R", "U/K"].includes(lit)) parts.push(`${lit}L`);
    if (cyl && block && !["-", "N/A"].includes(cyl)) parts.push(`${block}${cyl}`);
    else if (cyl && !["-", "N/A"].includes(cyl)) parts.push(`${cyl}-cyl`);
    if (asp === "Naturally Aspirated") parts.push("NA");
    else if (asp && !["-", "N/A", "N/R", "U/K"].includes(asp)) parts.push(asp);
    if (ft && !["-", "N/A", "N/R", "U/K"].includes(ft)) parts.push(ft);
    engineCfg.set(Number(row.id), parts.join(" ") || "Unknown engine");
  }

  const transCfg = new Map();
  for (const row of db
    .prepare(
      `SELECT t."TransmissionID" AS id,
              tt."TransmissionTypeName" AS typ,
              tn."TransmissionNumSpeeds" AS spd,
              tc."TransmissionControlTypeName" AS ctrl
       FROM "Transmission" t
       LEFT JOIN "TransmissionBase" tb ON tb."TransmissionBaseID" = t."TransmissionBaseID"
       LEFT JOIN "TransmissionType" tt ON tt."TransmissionTypeID" = tb."TransmissionTypeID"
       LEFT JOIN "TransmissionNumSpeeds" tn ON tn."TransmissionNumSpeedsID" = tb."TransmissionNumSpeedsID"
       LEFT JOIN "TransmissionControlType" tc ON tc."TransmissionControlTypeID" = tb."TransmissionControlTypeID"`,
    )
    .all()) {
    const bits = [row.spd, row.typ, row.ctrl]
      .map((x) => String(x || "").trim())
      .filter((s) => s && !["-", "N/A", "N/R", "U/K"].includes(s));
    transCfg.set(Number(row.id), bits.join(" ") || "Unknown transmission");
  }

  const brakeCfg = new Map();
  for (const row of db
    .prepare(
      `SELECT "BrakeConfigID" AS id, "FrontBrakeTypeID" AS f, "RearBrakeTypeID" AS r, "BrakeABSID" AS a
       FROM "BrakeConfig"`,
    )
    .all()) {
    const bits = [];
    const front = brakeType.get(Number(row.f)) || "";
    const rear = brakeType.get(Number(row.r)) || "";
    const abs = brakeAbs.get(Number(row.a)) || "";
    if (front) bits.push(`front ${front}`);
    if (rear) bits.push(`rear ${rear}`);
    if (abs && !["-", "N/A"].includes(abs)) bits.push(`ABS: ${abs}`);
    brakeCfg.set(Number(row.id), bits.join(", ") || "Unknown brakes");
  }

  const vEngines = new Map();
  for (const row of db
    .prepare(`SELECT "VehicleID" AS v, "EngineConfigID" AS e FROM "VehicleToEngineConfig"`)
    .all()) {
    const list = vEngines.get(Number(row.v)) || new Set();
    const name = engineCfg.get(Number(row.e));
    if (name) list.add(name);
    vEngines.set(Number(row.v), list);
  }

  const vTrans = new Map();
  for (const row of db
    .prepare(`SELECT "VehicleID" AS v, "TransmissionID" AS t FROM "VehicleToTransmission"`)
    .all()) {
    const list = vTrans.get(Number(row.v)) || new Set();
    const name = transCfg.get(Number(row.t));
    if (name) list.add(name);
    vTrans.set(Number(row.v), list);
  }

  const vDrive = new Map();
  for (const row of db
    .prepare(`SELECT "VehicleID" AS v, "DriveTypeID" AS d FROM "VehicleToDriveType"`)
    .all()) {
    const list = vDrive.get(Number(row.v)) || new Set();
    const name = drive.get(Number(row.d));
    if (name && !["-", "N/A"].includes(name)) list.add(name);
    vDrive.set(Number(row.v), list);
  }

  const vBrake = new Map();
  for (const row of db
    .prepare(`SELECT "VehicleID" AS v, "BrakeConfigID" AS b FROM "VehicleToBrakeConfig"`)
    .all()) {
    const list = vBrake.get(Number(row.v)) || new Set();
    const name = brakeCfg.get(Number(row.b));
    if (name) list.add(name);
    vBrake.set(Number(row.v), list);
  }

  const rows = db
    .prepare(
      `SELECT v."VehicleID" AS vid, bv."YearID" AS year, bv."MakeID" AS makeId,
              bv."ModelID" AS modelId, v."SubModelID" AS subId, v."RegionID" AS regionId
       FROM "Vehicle" v
       JOIN "BaseVehicle" bv ON bv."BaseVehicleID" = v."BaseVehicleID"
       WHERE CAST(bv."YearID" AS INTEGER) >= 2008`,
    )
    .all();

  const scored = rows.map((r) => {
    const make = makes.get(Number(r.makeId)) || "";
    const year = Number(r.year) || 0;
    let score = rng();
    if (PRIORITY_MAKES.has(make.toLowerCase())) score += 3;
    if (year >= 2016) score += 2;
    else if (year >= 2010) score += 1;
    return { score, r };
  });
  scored.sort((a, b) => b.score - a.score);

  const picked = scored.slice(0, maxVehicles * 2).map((x) => x.r);
  // shuffle
  for (let i = picked.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [picked[i], picked[j]] = [picked[j], picked[i]];
  }

  const profiles = [];
  for (const r of picked.slice(0, maxVehicles)) {
    const vid = Number(r.vid);
    const make = makes.get(Number(r.makeId)) || "Unknown";
    const modelInfo = models.get(Number(r.modelId)) || { name: "Unknown", vt: null };
    const sub =
      r.subId != null && r.subId !== ""
        ? submodels.get(Number(r.subId)) || null
        : null;
    profiles.push({
      vehicleId: vid,
      year: Number(r.year) || 0,
      make,
      model: modelInfo.name,
      submodel: sub,
      vehicleType: modelInfo.vt != null ? vtypes.get(modelInfo.vt) || null : null,
      region: regions.get(Number(r.regionId)) || null,
      engines: [...(vEngines.get(vid) || [])].sort(),
      transmissions: [...(vTrans.get(vid) || [])].sort(),
      driveTypes: [...(vDrive.get(vid) || [])].sort(),
      brakes: [...(vBrake.get(vid) || [])].sort(),
    });
  }

  console.error(`[profiles] ${profiles.length} vehicles loaded`);
  return profiles;
}

// ── Generators ─────────────────────────────────────────────────────

function genVehicleConfig(p, rng) {
  const label = labelOf(p);
  const engines = cleanList(p.engines);
  const trans = cleanList(p.transmissions);
  const drives = cleanList(p.driveTypes);
  const brakes = cleanList(p.brakes, 4);

  const mode = pick(rng, ["identity", "engines", "full"]);
  if (mode === "identity") {
    const user = pick(rng, [
      `What do you know about a ${p.year} ${p.make} ${p.model}?`,
      `Confirm the basics for my ${label}.`,
      `I'm working on a ${p.year} ${p.make} ${p.model}. Summarize the vehicle config.`,
    ]);
    const assistant = [
      `You're looking at a **${label}**`,
      p.vehicleType ? ` (${p.vehicleType})` : "",
      p.region ? `, ${p.region} catalog region` : "",
      ".\n\n",
      "**Focus on fitment first.** Use this exact vehicle when shopping parts or following DIY steps.\n\n",
      engines.length ? `Known engines in VCdb:\n${engines.map((e) => `- ${e}`).join("\n")}\n\n` : "",
      drives.length ? `Drive type(s): ${drives.join(", ")}\n\n` : "",
      "If you share your VIN or under-hood engine label, I can narrow this further.\n\n",
      DISCLAIMER,
    ].join("");
    return makeExample(user, assistant, {
      type: "vehicle_identity",
      vehicle_id: p.vehicleId,
    });
  }

  if (mode === "engines") {
    if (!engines.length) return null;
    const user = pick(rng, [
      `What engines came on the ${p.year} ${p.make} ${p.model}?`,
      `List engine options for a ${label}.`,
    ]);
    const assistant = [
      `For the **${label}**, VCdb lists these engine configurations:\n\n`,
      engines.map((e) => `- ${e}`).join("\n"),
      "\n\n**Focus Mode:** identify **your** engine before ordering plugs, filters, or sensors. ",
      "Check the hood sticker, VIN decode, or valve-cover label.\n\n",
      "What does your under-hood label say?\n\n",
      DISCLAIMER,
    ].join("");
    return makeExample(user, assistant, {
      type: "config_query_engines",
      vehicle_id: p.vehicleId,
    });
  }

  const user = pick(rng, [
    `Give me the configuration snapshot for my ${label}: engines, transmission, drive, brakes.`,
    `Config query — ${p.year} ${p.make} ${p.model}${p.submodel ? " " + p.submodel : ""}.`,
  ]);
  const assistant = [
    `## Configuration — **${label}**\n\n`,
    engines.length ? `**Engines**\n${engines.map((e) => `- ${e}`).join("\n")}\n\n` : "",
    trans.length ? `**Transmissions**\n${trans.map((t) => `- ${t}`).join("\n")}\n\n` : "",
    drives.length ? `**Drive**\n${drives.map((d) => `- ${d}`).join("\n")}\n\n` : "",
    brakes.length ? `**Brakes**\n${brakes.map((b) => `- ${b}`).join("\n")}\n\n` : "",
    "Use this when judging parts fitment. Tell me your symptom and we'll zoom into one system.\n\n",
    DISCLAIMER,
  ].join("");
  return makeExample(user, assistant, {
    type: "config_query_full",
    vehicle_id: p.vehicleId,
  });
}

function genPartsFitment(p, rng) {
  const scenario = pick(rng, PART_SCENARIOS);
  const label = labelOf(p);
  const engine = p.engines[0] || "your engine";
  const drive = p.driveTypes[0] || null;
  const user = pick(rng, [
    `Will ${scenario.part} fit my ${p.year} ${p.make} ${p.model}?`,
    `I need ${scenario.part} for a ${label}. How do I choose the right ones?`,
    `Does my ${label} (${engine}) take standard ${scenario.part}?`,
  ]);

  const assistant = [
    `Let's confirm **fitment** for **${scenario.part}** on your **${label}**`,
    ` (config: ${engine}`,
    drive ? `, ${drive}` : "",
    ").\n\n",
    `**Focus Mode — ${scenario.focus.toUpperCase()}**\n\n`,
    "### Fitment judgment (from vehicle config)\n",
    `- Year/Make/Model match: **${p.year} ${p.make} ${p.model}** — required\n`,
    p.submodel ? `- Submodel/trim **${p.submodel}** can change brakes/suspension packages — verify\n` : "",
    `- Engine **${engine}** matters for filters/plugs/sensors; less so for some chassis parts\n`,
    drive ? `- Drive type **${drive}** can change axles/hubs; usually not pad compound, but confirm listing notes\n` : "",
    "\n### What to buy\n",
    `- Prefer **1 OEM** path + **1–2** quality aftermarket: ${scenario.brands.join(", ")}\n`,
    `- Typical US street price band: **${scenario.price}** (varies by kit)\n`,
    "- I will **not invent an OEM number** from VCdb alone. Use this search, then verify with VIN:\n",
    `  \`${p.year} ${p.make} ${p.model} ${scenario.part}\`\n\n`,
    "Next action: do you have a VIN, or a photo of the old part number?\n\n",
    `<focus>${scenario.focus}</focus>\n\n`,
    DISCLAIMER,
  ].join("");

  return makeExample(user, assistant, {
    type: "parts_fitment",
    vehicle_id: p.vehicleId,
    part: scenario.part,
    focus: scenario.focus,
  });
}

function genFaultDiagnosis(p, rng) {
  const fault = pick(rng, FAULT_SCENARIOS);
  const label = labelOf(p);
  const engine = p.engines[0] || "unknown engine";
  const user = pick(rng, [
    `My ${label} has a ${fault.symptom}. What is most likely wrong?`,
    `${p.year} ${p.make} ${p.model} — ${fault.symptom}. Diagnose it.`,
    `Help: ${fault.symptom} on my ${p.year} ${p.make} ${p.model} (${engine}).`,
  ]);

  const causes = fault.causes
    .map((c) => `- **${c.cause}** (~${c.p}%)`)
    .join("\n");
  const checks = fault.firstChecks
    .map((c, i) => `${i + 1}. ${c}`)
    .join("\n");

  const assistant = [
    `## Diagnosis Summary\n`,
    `On your **${label}** (${engine}), the **main issue to focus on first** is related to **${fault.focus}**: **${fault.symptom}**.\n\n`,
    `**Focus Mode — ${fault.focus.toUpperCase()}**\n\n`,
    `### Possible Causes\n${causes}\n\n`,
    `### Next Checks (do these before replacing parts)\n${checks}\n\n`,
    "Config note: match any parts to this vehicle's engine/drive/brake listing before you buy.\n\n",
    "Which check can you do in the next 10 minutes?\n\n",
    `<focus>${fault.focus}</focus>\n\n`,
    DISCLAIMER,
  ].join("");

  return makeExample(user, assistant, {
    type: "fault_diagnosis",
    vehicle_id: p.vehicleId,
    focus: fault.focus,
    symptom: fault.symptom,
  });
}

function genRepairGuidance(p, rng) {
  const job = pick(rng, REPAIR_JOBS);
  const label = labelOf(p);
  const engine = p.engines[0] || "your engine";
  const user = pick(rng, [
    `How do I ${job.job} on a ${label}?`,
    `Walk me through ${job.job} for my ${p.year} ${p.make} ${p.model}.`,
    `DIY guide: ${job.job} — ${p.year} ${p.make} ${p.model} (${engine}).`,
  ]);

  const tools = job.tools.map((t) => `- ${t}`).join("\n");
  const steps = job.steps.map((s, i) => `${i + 1}. ${s}`).join("\n");

  const assistant = [
    `## Repair Guide — ${job.job}\n`,
    `Vehicle: **${label}** (${engine})\n\n`,
    `**Focus Mode — ${job.focus.toUpperCase()}** — one job at a time.\n\n`,
    `**Difficulty:** ${job.difficulty} · **Time:** ${job.time}\n\n`,
    `### Tools\n${tools}\n\n`,
    `### Steps\n${steps}\n\n`,
    "### Safety\n",
    "- Never work under a vehicle supported only by a jack — use jack stands.\n",
    "- If anything feels beyond your comfort (seized bolts, ABS issues, airbags), stop and use a shop.\n\n",
    "Tell me when step 1 is done and I'll coach the next step only.\n\n",
    `<focus>${job.focus}</focus>\n\n`,
    DISCLAIMER,
  ].join("");

  return makeExample(user, assistant, {
    type: "repair_guidance",
    vehicle_id: p.vehicleId,
    job: job.job,
    focus: job.focus,
  });
}

const GENERATORS = [
  genVehicleConfig,
  genPartsFitment,
  genFaultDiagnosis,
  genRepairGuidance,
];

// ── Main ───────────────────────────────────────────────────────────

function loadExistingIds(outPath) {
  const ids = new Set();
  if (!fs.existsSync(outPath)) return ids;
  for (const line of fs.readFileSync(outPath, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      if (obj.id) ids.add(obj.id);
      else if (obj.messages) ids.add(hashRecord(obj.messages));
    } catch {
      /* skip */
    }
  }
  return ids;
}

function main() {
  const args = parseArgs(process.argv);

  if (!fs.existsSync(args.sqlite)) {
    console.error(
      `SQLite cache not found: ${args.sqlite}\n` +
        `Build it first:\n` +
        `  python3 scripts/train/vcdb_sql_to_jsonl.py --sql "/path/to/AutoCare_VCdb_....sql" --limit 100\n`,
    );
    process.exit(1);
  }

  const db = new DatabaseSync(args.sqlite, { readOnly: true });

  if (args.analyze) {
    analyze(db);
    db.close();
    return;
  }

  const profiles = buildProfiles(db, args.vehicles, args.seed);
  db.close();

  const existing = args.append ? loadExistingIds(args.out) : new Set();
  if (!args.append && fs.existsSync(args.out)) {
    fs.unlinkSync(args.out);
  }
  fs.mkdirSync(path.dirname(args.out), { recursive: true });

  const rng = mulberry32(args.seed);
  const typeCounts = Object.create(null);
  let written = 0;
  let attempts = 0;
  const maxAttempts = args.count * 20;

  const fh = fs.openSync(args.out, args.append ? "a" : "w");

  while (written < args.count && attempts < maxAttempts) {
    attempts++;
    const p = pick(rng, profiles);
    const gen = pick(rng, GENERATORS);
    const rec = gen(p, rng);
    if (!rec) continue;
    if (existing.has(rec.id)) continue;
    existing.add(rec.id);

    // DeepSeek fine-tune line: messages only (+ optional metadata stripped for upload)
    const lineObj = { messages: rec.messages };
    fs.writeSync(fh, `${JSON.stringify(lineObj)}\n`);
    written++;
    const t = rec.metadata?.type || "unknown";
    typeCounts[t] = (typeCounts[t] || 0) + 1;
  }

  fs.closeSync(fh);

  // Also write a companion file with metadata for analysis (optional)
  const metaOut = args.out.replace(/\.jsonl$/, ".meta.json");
  fs.writeFileSync(
    metaOut,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        count: written,
        append: args.append,
        sqlite: args.sqlite,
        type_counts: typeCounts,
        system_prompt_file: "scripts/train/deepseek-finetune-system-prompt.mjs",
        format: "deepseek_chat_messages",
        note: "VCdb-grounded DIY coach samples; OEM numbers intentionally not hallucinated",
      },
      null,
      2,
    ),
  );

  console.error(`[jsonl] wrote ${written} samples → ${args.out}`);
  console.error(`[jsonl] type mix:`, typeCounts);

  // preview
  const preview = fs.readFileSync(args.out, "utf8").trim().split("\n").slice(-1)[0];
  if (preview) {
    const obj = JSON.parse(preview);
    console.error("\n--- last sample user ---");
    console.error(obj.messages.find((m) => m.role === "user")?.content?.slice(0, 180));
  }
}

main();
