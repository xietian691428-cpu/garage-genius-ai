#!/usr/bin/env node
/**
 * Convert car_fault symptom classification corpus → knowledge_base seed JSON.
 *
 * Input lines:  "<symptom text>\t<label_index>"
 * Labels:       fault_class.txt (0-based index)
 *
 * Usage:
 *   node scripts/train/car-fault-to-knowledge.mjs
 *   node scripts/train/car-fault-to-knowledge.mjs --dir=scripts/data/autodata/car_fault
 *
 * Then:
 *   npm run seed:car-fault:text
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { createHash } from "crypto";

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const dir = resolve(
  process.cwd(),
  getArg("dir", "scripts/data/autodata/car_fault"),
);
const outPath = resolve(
  process.cwd(),
  getArg("out", "scripts/data/car-fault-knowledge-seed.json"),
);

const DISCLAIMER =
  "Not professional mechanic advice. Confirm with a scan tool / OEM service info for your VIN and market before replacing parts.";

/** Map Chinese fault class → RAG category + short DIY first checks (EN). */
const CLASS_META = {
  发动机故障: {
    category: "engine",
    en: "Engine",
    checks: [
      "Scan for DTCs and note freeze-frame (RPM, load, coolant temp).",
      "Check battery voltage, air filter, obvious vacuum/intake leaks.",
      "Listen for misfire vs. mechanical knock; inspect plugs/coils if misfire codes present.",
    ],
  },
  制动系统故障: {
    category: "brake",
    en: "Brake system",
    checks: [
      "Verify brake fluid level and condition; look for leaks at lines/calipers.",
      "Inspect pad thickness and rotor condition; check for soft pedal vs. ABS pulse.",
      "Do not drive if pedal sinks or braking distance is clearly unsafe.",
    ],
  },
  刹车系统故障: {
    category: "brake",
    en: "Brakes",
    checks: [
      "Check pad/rotor wear, caliper slide pins, and fluid level.",
      "Road-test carefully for pull, grind, or soft pedal; scan ABS module if warning lamp is on.",
      "Seek a shop immediately if braking feel is unsafe.",
    ],
  },
  电气系统故障: {
    category: "electrical",
    en: "Electrical system",
    checks: [
      "Measure resting and running battery/alternator voltage.",
      "Inspect battery terminals, grounds, and recent aftermarket wiring.",
      "Scan body/PCM modules for communication or low-voltage related codes.",
    ],
  },
  悬挂系统故障: {
    category: "suspension",
    en: "Suspension",
    checks: [
      "Visually inspect shocks/struts, control arms, bushings, and sway-bar links.",
      "Check tire pressure and look for cupping/uneven wear.",
      "Bounce/test for clunks over bumps; align only after worn parts are fixed.",
    ],
  },
  传动系统故障: {
    category: "engine",
    en: "Drivetrain",
    checks: [
      "Note when noise/vibration occurs (accel, coast, turn).",
      "Check CV boots, mounts, and fluid leaks around transmission/transfer case.",
      "Avoid hard acceleration until the source is identified.",
    ],
  },
  点火系统故障: {
    category: "engine",
    en: "Ignition system",
    checks: [
      "Scan for misfire (P030x) and ignition-related codes.",
      "Inspect spark plugs, coil boots, and plug wires for carbon tracking.",
      "Confirm battery health before chasing no-start click/no-spark issues.",
    ],
  },
  燃油系统故障: {
    category: "engine",
    en: "Fuel system",
    checks: [
      "Confirm fuel level sensor vs. actual tank; listen for pump prime.",
      "Check fuel pressure if equipped; inspect for leaks/smell of raw fuel.",
      "Scan short/long fuel trims before replacing injectors or pump.",
    ],
  },
  转向系统故障: {
    category: "suspension",
    en: "Steering",
    checks: [
      "Check power-steering fluid (hydraulic) or EPS warning lamps (electric).",
      "Inspect tie rods, bellows, and pump/ rack for leaks or play.",
      "Do not continue highway driving if assist is lost or steering is binding.",
    ],
  },
  空调系统故障: {
    category: "electrical",
    en: "HVAC / A/C",
    checks: [
      "Verify blower operation on all speeds and cabin filter condition.",
      "Check for A/C clutch engagement and unusual compressor noise.",
      "Refrigerant work needs gauges/certification — diagnose before adding gas.",
    ],
  },
  轮胎系统故障: {
    category: "general",
    en: "Tires",
    checks: [
      "Measure pressures cold; inspect for bulge, puncture, or uneven wear.",
      "Confirm TPMS warnings and spare/repair kit readiness.",
      "Replace unsafe tires before alignment or suspension diagnosis.",
    ],
  },
  轮胎故障: {
    category: "general",
    en: "Tire fault",
    checks: [
      "Inspect tread depth, sidewall damage, and pressure.",
      "Check for wheel/tire imbalance symptoms above ~80 km/h (50 mph).",
      "Rotate or replace as needed; verify lug torque after service.",
    ],
  },
  油路系统故障: {
    category: "engine",
    en: "Oil / lubrication circuit",
    checks: [
      "Check oil level/condition and recent oil-service history.",
      "Note oil-pressure warning lamp behavior at idle vs. RPM.",
      "Stop driving if oil pressure is low — engine damage risk.",
    ],
  },
  冷却系统故障: {
    category: "engine",
    en: "Cooling system",
    checks: [
      "Check coolant level cold; inspect hoses, radiator, and water pump weep.",
      "Watch for overheat on gauge; never open a hot radiator cap.",
      "Scan for thermostat/fan/ECT codes; pressure-test if overheating persists.",
    ],
  },
  变速箱故障: {
    category: "engine",
    en: "Transmission",
    checks: [
      "Note shift quality, flares, or slip; check ATF level/condition if applicable.",
      "Scan TCM/PCM for transmission codes before fluid flushes.",
      "Avoid towing/heavy load until diagnosed if slipping is severe.",
    ],
  },
  灯光系统故障: {
    category: "electrical",
    en: "Lighting",
    checks: [
      "Verify bulb/LED module, fuse, and ground for the affected circuit.",
      "Check multifunction switch and trailer wiring if related.",
      "Aim headlights after replacement if beam pattern looks wrong.",
    ],
  },
  排气系统故障: {
    category: "engine",
    en: "Exhaust",
    checks: [
      "Listen for leaks at manifold/flex pipe; inspect for soot or broken hangers.",
      "Blue/white/black smoke points to oil/coolant/fuel issues — scan + visual check.",
      "Do not ignore exhaust fumes in cabin (CO risk).",
    ],
  },
  传动轴故障: {
    category: "suspension",
    en: "Driveshaft / axle",
    checks: [
      "Note vibration that changes with speed vs. load.",
      "Inspect CV/U-joints, center support bearing, and axle seals.",
      "Park safely if a joint fails or shaft is contacting the body.",
    ],
  },
  安全系统故障: {
    category: "electrical",
    en: "Safety / SRS",
    checks: [
      "Do not probe airbag circuits with a standard test light.",
      "Scan SRS module; inspect clock spring / seat connectors after seats moved.",
      "Have SRS work done with proper procedures — unintended deployment risk.",
    ],
  },
  车窗及车门故障: {
    category: "electrical",
    en: "Windows / doors",
    checks: [
      "Check fuse, master/door switches, and regulator operation.",
      "Inspect door harness flex area for broken wires.",
      "Lubricate tracks; replace regulator if motor runs but glass does not move.",
    ],
  },
  传感器故障: {
    category: "diagnostics",
    en: "Sensors",
    checks: [
      "Scan and record codes + live data for the named sensor.",
      "Check connector corrosion, reference voltage, and wiring chafe.",
      "Do not replace sensors blindly — verify signal vs. known-good values.",
    ],
  },
  排放系统故障: {
    category: "diagnostics",
    en: "Emissions",
    checks: [
      "Scan readiness monitors and catalyst/EVAP-related codes.",
      "Inspect EVAP hoses, purge valve, and exhaust leaks upstream of O2 sensors.",
      "Fix root cause before replacing catalytic converter.",
    ],
  },
};

function loadClasses(path) {
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

function parseFaultFile(path, classes) {
  const out = [];
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const tab = trimmed.lastIndexOf("\t");
    if (tab < 0) continue;
    const text = trimmed.slice(0, tab).trim();
    const lab = Number(trimmed.slice(tab + 1).trim());
    if (!text || !Number.isInteger(lab) || lab < 0 || lab >= classes.length) {
      continue;
    }
    out.push({ text, label: lab, className: classes[lab] });
  }
  return out;
}

function majorityLabel(entries) {
  const counts = new Map();
  for (const e of entries) {
    counts.set(e.label, (counts.get(e.label) || 0) + 1);
  }
  let best = entries[0].label;
  let bestN = -1;
  for (const [lab, n] of counts) {
    if (n > bestN || (n === bestN && lab < best)) {
      best = lab;
      bestN = n;
    }
  }
  return best;
}

function ingestKeyFor(text, label) {
  const hash = createHash("sha1").update(text).digest("hex").slice(0, 12);
  return `car_fault_${label}_${hash}`;
}

function toSeed(text, className, label) {
  const meta = CLASS_META[className] || {
    category: "diagnostics",
    en: className,
    checks: [
      "Scan for DTCs and inspect the subsystem matching the symptom.",
      "Verify basics (fluid levels, tire pressure, battery) before parts replacement.",
    ],
  };

  const checks = meta.checks.map((c, i) => `${i + 1}. ${c}`).join("\n");

  return {
    title:
      text.length > 100
        ? `${text.slice(0, 97)}... → ${className}`
        : `${text} → ${className}`,
    content: [
      `Car fault symptom classification (Chinese corpus → DIY triage).`,
      ``,
      `Symptom: ${text}`,
      `Likely system: ${className} (${meta.en}).`,
      ``,
      `DIY first checks:`,
      checks,
      ``,
      DISCLAIMER,
    ].join("\n"),
    source: "diagnostics",
    vehicle_make: null,
    vehicle_model: null,
    vehicle_years: null,
    category: meta.category,
    metadata: {
      ingest_key: ingestKeyFor(text, label),
      fault_class: className,
      fault_class_en: meta.en,
      fault_label_index: label,
      language: "zh",
      corpus: "car_fault",
      rag_tier: "repair",
      region: "global",
      source_label: "car_fault",
    },
    is_active: true,
  };
}

const classPath = resolve(dir, "fault_class.txt");
const trainPath = resolve(dir, "fault_train.txt");
const testPath = resolve(dir, "fault_test.txt");

for (const p of [classPath, trainPath, testPath]) {
  if (!existsSync(p)) {
    console.error(`Missing: ${p}`);
    process.exit(1);
  }
}

const classes = loadClasses(classPath);
const train = parseFaultFile(trainPath, classes);
const test = parseFaultFile(testPath, classes);
const all = [...train, ...test];

/** @type {Map<string, typeof all>} */
const byText = new Map();
for (const row of all) {
  const list = byText.get(row.text) || [];
  list.push(row);
  byText.set(row.text, list);
}

const seeds = [];
let conflicts = 0;
for (const [text, entries] of byText) {
  const labels = new Set(entries.map((e) => e.label));
  if (labels.size > 1) conflicts += 1;
  const label = majorityLabel(entries);
  seeds.push(toSeed(text, classes[label], label));
}

writeFileSync(outPath, JSON.stringify(seeds, null, 2) + "\n", "utf8");
console.log(
  `Wrote ${seeds.length} car_fault knowledge rows → ${outPath} (from ${all.length} lines; conflicts resolved ${conflicts})`,
);
console.log(`Next: npm run seed:car-fault:text`);
