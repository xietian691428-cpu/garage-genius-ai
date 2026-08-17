#!/usr/bin/env npx tsx
/**
 * Seed 5 CN+US mainstream garage vehicles on the primary QA / E2E test account.
 *
 * Usage (never commit secrets):
 *   node --env-file=.env.local --env-file=.env.e2e.local --import tsx \
 *     scripts/seed-qa-garage-vehicles.ts
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *           E2E_EMAIL (or QA_SEED_EMAIL) matching the smoke-test account.
 *
 * - Archives existing active garage rows for that user (frees plan slots)
 * - Inserts 5 fully-filled test vehicles (no chat seed messages)
 * - Sets Camry as is_current
 * - Ensures long-lived QA trial on profiles so Pro vehicle quota applies
 */

import { createClient } from "@supabase/supabase-js";
import { LONG_LIVED_QA_TRIAL_ENDS_AT } from "../lib/qa-test-account";

const EMAIL = (
  process.env.QA_SEED_EMAIL ||
  process.env.E2E_EMAIL ||
  "18565006079@163.com"
)
  .trim()
  .toLowerCase();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** ISO-3779 / NHTSA check digit (position 9 / index 8). */
function vinCheckDigit(vin17: string): string {
  const translit: Record<string, number> = {
    A: 1,
    B: 2,
    C: 3,
    D: 4,
    E: 5,
    F: 6,
    G: 7,
    H: 8,
    J: 1,
    K: 2,
    L: 3,
    M: 4,
    N: 5,
    P: 7,
    R: 9,
    S: 2,
    T: 3,
    U: 4,
    V: 5,
    W: 6,
    X: 7,
    Y: 8,
    Z: 9,
  };
  const weights = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    if (i === 8) continue;
    const ch = vin17[i].toUpperCase();
    const val = /[0-9]/.test(ch) ? Number(ch) : translit[ch];
    if (val === undefined) throw new Error(`Invalid VIN char at ${i}: ${ch}`);
    sum += val * weights[i];
  }
  const mod = sum % 11;
  return mod === 10 ? "X" : String(mod);
}

function makeTestVin(template: string): string {
  // 17 chars; index 8 must be placeholder (any char), replaced by check digit
  if (template.length !== 17) {
    throw new Error(`bad vin template length: ${template}`);
  }
  const digit = vinCheckDigit(template);
  return `${template.slice(0, 8)}${digit}${template.slice(9)}`;
}

type SeedVehicle = {
  name: string;
  year: number;
  make: string;
  model: string;
  submodel: string;
  mileage: number;
  mileage_unit: "miles" | "km";
  market: string;
  engine: string;
  transmission: string;
  drive_type: string;
  brakes: string;
  fuel_grade: string;
  oil_capacity: string;
  oil_viscosity: string;
  vin: string;
  license_plate: string;
  notes: string;
  tags: string[];
  country_region: string;
  country_state: string | null;
  is_current: boolean;
};

const SEEDS: SeedVehicle[] = [
  {
    name: "Test Camry US",
    year: 2019,
    make: "Toyota",
    model: "Camry",
    submodel: "LE",
    mileage: 62_400,
    mileage_unit: "miles",
    market: "US",
    engine: "2.5L I4",
    transmission: "8-speed Automatic",
    drive_type: "FWD",
    brakes: "Disc",
    fuel_grade: "Regular 87 AKI",
    oil_capacity: "4.8 qt with filter",
    oil_viscosity: "0W-16",
    vin: makeTestVin("4T1B11HKXKU900001"),
    license_plate: "TEST01",
    notes:
      "QA seed only — Camry / 凯美瑞 alias gate. VIN is synthetic test-only.",
    tags: ["Daily Driver", "QA Seed"],
    country_region: "United States",
    country_state: "CA",
    is_current: true,
  },
  {
    name: "Test Civic US",
    year: 2020,
    make: "Honda",
    model: "Civic",
    submodel: "Sport",
    mileage: 48_200,
    mileage_unit: "miles",
    market: "US",
    engine: "2.0L I4",
    transmission: "CVT",
    drive_type: "FWD",
    brakes: "Disc",
    fuel_grade: "Regular 87 AKI",
    oil_capacity: "3.7 qt with filter",
    oil_viscosity: "0W-20",
    vin: makeTestVin("19XFC2F6XLE900002"),
    license_plate: "TEST02",
    notes:
      "QA seed only — Civic / 思域 alias gate. VIN is synthetic test-only.",
    tags: ["Daily Driver", "QA Seed"],
    country_region: "United States",
    country_state: "TX",
    is_current: false,
  },
  {
    name: "Test Corolla CN",
    year: 2018,
    make: "Toyota",
    model: "Corolla",
    submodel: "SE",
    mileage: 95_000,
    mileage_unit: "km",
    market: "OTHER",
    engine: "1.8L I4",
    transmission: "CVT",
    drive_type: "FWD",
    brakes: "Disc",
    fuel_grade: "92 RON",
    oil_capacity: "4.2 L with filter",
    oil_viscosity: "0W-20",
    vin: makeTestVin("2T1BURHEXJC900003"),
    license_plate: "TEST03",
    notes:
      "QA seed only — Corolla / 卡罗拉 alias gate; km + China owner context (market=OTHER). VIN is synthetic test-only.",
    tags: ["Daily Driver", "QA Seed"],
    country_region: "China",
    country_state: null,
    is_current: false,
  },
  {
    name: "Test Escape US",
    year: 2021,
    make: "Ford",
    model: "Escape",
    submodel: "SE",
    mileage: 36_800,
    mileage_unit: "miles",
    market: "US",
    engine: "1.5L EcoBoost I3",
    transmission: "8-speed Automatic",
    drive_type: "AWD",
    brakes: "Disc",
    fuel_grade: "Regular 87 AKI",
    oil_capacity: "5.7 qt with filter",
    oil_viscosity: "5W-20",
    vin: makeTestVin("1FMCU9G6XMU900004"),
    license_plate: "TEST04",
    notes:
      "QA seed only — Escape / 翼虎 related CN market name. VIN is synthetic test-only.",
    tags: ["Daily Driver", "QA Seed"],
    country_region: "United States",
    country_state: "FL",
    is_current: false,
  },
  {
    name: "Test 320i CN",
    year: 2019,
    make: "BMW",
    model: "320i",
    submodel: "Sedan",
    mileage: 72_500,
    mileage_unit: "km",
    market: "OTHER",
    engine: "2.0L L4 Turbocharged GAS",
    transmission: "8-speed Automatic",
    drive_type: "RWD",
    brakes: "Disc",
    fuel_grade: "95 RON",
    oil_capacity: "5.2 L with filter",
    oil_viscosity: "0W-20",
    vin: makeTestVin("WBA8E9G5XKN900005"),
    license_plate: "TEST05",
    notes:
      "QA seed only — BMW 320i / 3系 gate control; km + China owner context (market=OTHER). VIN is synthetic test-only.",
    tags: ["Daily Driver", "QA Seed"],
    country_region: "China",
    country_state: null,
    is_current: false,
  },
];

async function findUserIdByEmail(email: string): Promise<string> {
  // Prefer auth admin list; paginate a bit for small projects
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw error;
    const hit = data.users.find(
      (u) => (u.email || "").trim().toLowerCase() === email,
    );
    if (hit?.id) return hit.id;
    if (data.users.length < 200) break;
  }
  throw new Error(`Auth user not found for ${email}`);
}

async function main() {
  console.log(`[seed-qa-garage] target email=${emailMask(EMAIL)}`);
  const userId = await findUserIdByEmail(EMAIL);
  console.log(`[seed-qa-garage] user_id=${userId}`);

  // Keep Pro vehicle quota (trial) for QA account
  const { error: profileErr } = await admin
    .from("profiles")
    .update({
      subscription_status: "trialing",
      trial_ends_at: LONG_LIVED_QA_TRIAL_ENDS_AT,
    })
    .eq("id", userId);
  if (profileErr) {
    console.warn("[seed-qa-garage] profile trial update:", profileErr.message);
  } else {
    console.log("[seed-qa-garage] ensured long-lived QA trial on profile");
  }

  // Archive all currently active vehicles (frees plan slots; keeps history)
  const { data: active, error: listErr } = await admin
    .from("user_vehicles")
    .select("id, name, year, make, model")
    .eq("user_id", userId)
    .is("archived_at", null);
  if (listErr) throw listErr;

  if (active?.length) {
    const { error: archErr } = await admin
      .from("user_vehicles")
      .update({ archived_at: new Date().toISOString(), is_current: false })
      .eq("user_id", userId)
      .is("archived_at", null);
    if (archErr) throw archErr;
    console.log(
      `[seed-qa-garage] archived ${active.length} prior active vehicle(s)`,
    );
  } else {
    console.log("[seed-qa-garage] no prior active vehicles");
  }

  const rows = SEEDS.map((s) => ({
    user_id: userId,
    name: s.name,
    year: s.year,
    make: s.make,
    model: s.model,
    submodel: s.submodel,
    mileage: s.mileage,
    mileage_unit: s.mileage_unit,
    market: s.market,
    engine: s.engine,
    transmission: s.transmission,
    drive_type: s.drive_type,
    brakes: s.brakes,
    fuel_grade: s.fuel_grade,
    oil_capacity: s.oil_capacity,
    oil_viscosity: s.oil_viscosity,
    vin: s.vin,
    license_plate: s.license_plate,
    notes: s.notes,
    tags: s.tags,
    country_region: s.country_region,
    country_state: s.country_state,
    is_current: s.is_current,
    archived_at: null,
    vcdb: null,
  }));

  const { data: inserted, error: insErr } = await admin
    .from("user_vehicles")
    .insert(rows)
    .select("id, name, year, make, model, mileage, mileage_unit, market, license_plate, is_current");
  if (insErr) throw insErr;

  console.log("[seed-qa-garage] inserted:");
  for (const r of inserted || []) {
    console.log(
      `  - ${r.is_current ? "[CURRENT] " : ""}${r.name} · ${r.year} ${r.make} ${r.model} · ${r.mileage} ${r.mileage_unit} · ${r.market} · plate ${r.license_plate} · id=${r.id}`,
    );
  }

  const current = (inserted || []).find((r) => r.is_current);
  if (!current) {
    console.warn("[seed-qa-garage] warning: no is_current row after insert");
  } else {
    console.log(
      `[seed-qa-garage] default selected: ${current.name} (${current.id})`,
    );
  }

  console.log("[seed-qa-garage] done — no chat messages seeded (empty history).");
}

function emailMask(email: string): string {
  const [u, d] = email.split("@");
  if (!d) return "***";
  return `${u.slice(0, 3)}***@${d}`;
}

main().catch((err) => {
  console.error("[seed-qa-garage] FAILED", err);
  process.exit(1);
});
