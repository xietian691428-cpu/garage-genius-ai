import type {
  VcdbOptions,
  VcdbResolveInput,
  VcdbResolvedConfig,
  VcdbStatus,
} from "@/lib/types/vcdb";
import { getVcdbDb, getVcdbPath, isJunkLabel } from "@/lib/vcdb/db";
import { lookupFluidSpecs } from "@/lib/vcdb/fluid-specs";

const YEAR_MIN = 1990;
const YEAR_MAX = 2030;

function openOrThrow() {
  const db = getVcdbDb();
  if (!db) {
    throw new Error(
      "VCdb cache not found. Build it with: python3 scripts/train/vcdb_sql_to_jsonl.py --rebuild-sqlite --sql <AutoCare.sql>",
    );
  }
  return db;
}

export function getVcdbStatus(): VcdbStatus {
  const path = getVcdbPath();
  const db = getVcdbDb();
  if (!db || !path) {
    return {
      available: false,
      message:
        "Vehicle configuration database is not available on this server yet. You can still add a vehicle manually.",
    };
  }
  try {
    const row = db.prepare(`SELECT COUNT(*) AS c FROM "Vehicle"`).get() as {
      c: number;
    };
    return {
      available: true,
      path,
      vehicleCount: Number(row.c) || 0,
    };
  } catch (err) {
    return {
      available: false,
      path,
      message: err instanceof Error ? err.message : "Failed to read VCdb",
    };
  }
}

export function listYears(): number[] {
  const db = openOrThrow();
  const rows = db
    .prepare(
      `SELECT DISTINCT CAST("YearID" AS INTEGER) AS y
       FROM "BaseVehicle"
       WHERE CAST("YearID" AS INTEGER) BETWEEN ? AND ?
       ORDER BY y DESC`,
    )
    .all(YEAR_MIN, YEAR_MAX) as { y: number }[];
  return rows.map((r) => Number(r.y)).filter((y) => Number.isFinite(y));
}

export function listMakes(year: number): string[] {
  const db = openOrThrow();
  const rows = db
    .prepare(
      `SELECT DISTINCT mk."MakeName" AS name
       FROM "BaseVehicle" bv
       JOIN "Make" mk ON mk."MakeID" = bv."MakeID"
       WHERE bv."YearID" = ?
       ORDER BY mk."MakeName"`,
    )
    .all(String(year)) as { name: string }[];
  return rows.map((r) => String(r.name || "").trim()).filter(Boolean);
}

export function listModels(year: number, make: string): string[] {
  const db = openOrThrow();
  const rows = db
    .prepare(
      `SELECT DISTINCT md."ModelName" AS name
       FROM "BaseVehicle" bv
       JOIN "Make" mk ON mk."MakeID" = bv."MakeID"
       JOIN "Model" md ON md."ModelID" = bv."ModelID"
       WHERE bv."YearID" = ? AND mk."MakeName" = ?
       ORDER BY md."ModelName"`,
    )
    .all(String(year), make) as { name: string }[];
  return rows.map((r) => String(r.name || "").trim()).filter(Boolean);
}

export function listSubmodels(
  year: number,
  make: string,
  model: string,
): string[] {
  const db = openOrThrow();
  const rows = db
    .prepare(
      `SELECT DISTINCT sm."SubModelName" AS name
       FROM "Vehicle" v
       JOIN "BaseVehicle" bv ON bv."BaseVehicleID" = v."BaseVehicleID"
       JOIN "Make" mk ON mk."MakeID" = bv."MakeID"
       JOIN "Model" md ON md."ModelID" = bv."ModelID"
       JOIN "SubModel" sm ON sm."SubModelID" = v."SubModelID"
       WHERE bv."YearID" = ? AND mk."MakeName" = ? AND md."ModelName" = ?
       ORDER BY sm."SubModelName"`,
    )
    .all(String(year), make, model) as { name: string }[];
  return rows.map((r) => String(r.name || "").trim()).filter(Boolean);
}

function vehicleIdsForYmm(
  year: number,
  make: string,
  model: string,
  submodel?: string | null,
): number[] {
  const db = openOrThrow();
  if (submodel) {
    const rows = db
      .prepare(
        `SELECT DISTINCT CAST(v."VehicleID" AS INTEGER) AS id
         FROM "Vehicle" v
         JOIN "BaseVehicle" bv ON bv."BaseVehicleID" = v."BaseVehicleID"
         JOIN "Make" mk ON mk."MakeID" = bv."MakeID"
         JOIN "Model" md ON md."ModelID" = bv."ModelID"
         JOIN "SubModel" sm ON sm."SubModelID" = v."SubModelID"
         WHERE bv."YearID" = ? AND mk."MakeName" = ? AND md."ModelName" = ?
           AND sm."SubModelName" = ?`,
      )
      .all(String(year), make, model, submodel) as { id: number }[];
    return rows.map((r) => Number(r.id)).filter(Number.isFinite);
  }

  const rows = db
    .prepare(
      `SELECT DISTINCT CAST(v."VehicleID" AS INTEGER) AS id
       FROM "Vehicle" v
       JOIN "BaseVehicle" bv ON bv."BaseVehicleID" = v."BaseVehicleID"
       JOIN "Make" mk ON mk."MakeID" = bv."MakeID"
       JOIN "Model" md ON md."ModelID" = bv."ModelID"
       WHERE bv."YearID" = ? AND mk."MakeName" = ? AND md."ModelName" = ?`,
    )
    .all(String(year), make, model) as { id: number }[];
  return rows.map((r) => Number(r.id)).filter(Number.isFinite);
}

function engineLabel(row: {
  liter: string | null;
  cyl: string | null;
  block: string | null;
  asp: string | null;
  fuel: string | null;
}): string {
  const parts: string[] = [];
  const lit = String(row.liter || "").trim();
  const cyl = String(row.cyl || "").trim();
  const block = String(row.block || "").trim();
  const asp = String(row.asp || "").trim();
  const fuel = String(row.fuel || "").trim();

  if (lit && !isJunkLabel(lit)) parts.push(`${lit}L`);
  if (cyl && block && !isJunkLabel(cyl)) parts.push(`${block}${cyl}`);
  else if (cyl && !isJunkLabel(cyl)) parts.push(`${cyl}-cyl`);

  if (asp === "Naturally Aspirated") parts.push("NA");
  else if (asp && !isJunkLabel(asp)) parts.push(asp);

  if (fuel && !isJunkLabel(fuel)) parts.push(fuel);
  return parts.join(" ") || "Unknown engine";
}

function transmissionLabel(row: {
  typ: string | null;
  spd: string | null;
  ctrl: string | null;
}): string {
  const bits = [row.spd, row.typ, row.ctrl]
    .map((x) => String(x || "").trim())
    .filter((s) => s && !isJunkLabel(s));
  return bits.join(" ") || "Unknown transmission";
}

function brakeLabel(row: {
  front: string | null;
  rear: string | null;
  abs: string | null;
}): string {
  const bits: string[] = [];
  const front = String(row.front || "").trim();
  const rear = String(row.rear || "").trim();
  const abs = String(row.abs || "").trim();
  if (front && !isJunkLabel(front)) bits.push(`front ${front}`);
  if (rear && !isJunkLabel(rear)) bits.push(`rear ${rear}`);
  if (abs && !isJunkLabel(abs)) bits.push(`ABS: ${abs}`);
  return bits.join(", ") || "Unknown brakes";
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set([...values].filter((v) => v && !isJunkLabel(v)))].sort(
    (a, b) => a.localeCompare(b),
  );
}

function chunkedInQuery<T>(
  ids: number[],
  run: (chunk: number[]) => T[],
): T[] {
  const CHUNK = 400;
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    out.push(...run(ids.slice(i, i + CHUNK)));
  }
  return out;
}

export function listOptions(
  year: number,
  make: string,
  model: string,
  submodel?: string | null,
): VcdbOptions {
  const db = openOrThrow();
  const ids = vehicleIdsForYmm(year, make, model, submodel);
  if (ids.length === 0) {
    return {
      engines: [],
      transmissions: [],
      driveTypes: [],
      brakes: [],
      vehicleIds: [],
    };
  }

  const engineRows = chunkedInQuery(ids, (chunk) => {
    const placeholders = chunk.map(() => "?").join(",");
    return db
      .prepare(
        `SELECT DISTINCT eb."Liter" AS liter, eb."Cylinders" AS cyl, eb."BlockType" AS block,
                a."AspirationName" AS asp, f."FuelTypeName" AS fuel
         FROM "VehicleToEngineConfig" vte
         JOIN "EngineConfig" ec ON ec."EngineConfigID" = vte."EngineConfigID"
         LEFT JOIN "EngineBase" eb ON eb."EngineBaseID" = ec."EngineBaseID"
         LEFT JOIN "Aspiration" a ON a."AspirationID" = ec."AspirationID"
         LEFT JOIN "FuelType" f ON f."FuelTypeID" = ec."FuelTypeID"
         WHERE CAST(vte."VehicleID" AS INTEGER) IN (${placeholders})`,
      )
      .all(...chunk) as {
      liter: string | null;
      cyl: string | null;
      block: string | null;
      asp: string | null;
      fuel: string | null;
    }[];
  });

  const transRows = chunkedInQuery(ids, (chunk) => {
    const placeholders = chunk.map(() => "?").join(",");
    return db
      .prepare(
        `SELECT DISTINCT tt."TransmissionTypeName" AS typ,
                tn."TransmissionNumSpeeds" AS spd,
                tc."TransmissionControlTypeName" AS ctrl
         FROM "VehicleToTransmission" vtt
         JOIN "Transmission" t ON t."TransmissionID" = vtt."TransmissionID"
         LEFT JOIN "TransmissionBase" tb ON tb."TransmissionBaseID" = t."TransmissionBaseID"
         LEFT JOIN "TransmissionType" tt ON tt."TransmissionTypeID" = tb."TransmissionTypeID"
         LEFT JOIN "TransmissionNumSpeeds" tn ON tn."TransmissionNumSpeedsID" = tb."TransmissionNumSpeedsID"
         LEFT JOIN "TransmissionControlType" tc ON tc."TransmissionControlTypeID" = tb."TransmissionControlTypeID"
         WHERE CAST(vtt."VehicleID" AS INTEGER) IN (${placeholders})`,
      )
      .all(...chunk) as {
      typ: string | null;
      spd: string | null;
      ctrl: string | null;
    }[];
  });

  const driveRows = chunkedInQuery(ids, (chunk) => {
    const placeholders = chunk.map(() => "?").join(",");
    return db
      .prepare(
        `SELECT DISTINCT d."DriveTypeName" AS name
         FROM "VehicleToDriveType" vtd
         JOIN "DriveType" d ON d."DriveTypeID" = vtd."DriveTypeID"
         WHERE CAST(vtd."VehicleID" AS INTEGER) IN (${placeholders})`,
      )
      .all(...chunk) as { name: string | null }[];
  });

  const brakeRows = chunkedInQuery(ids, (chunk) => {
    const placeholders = chunk.map(() => "?").join(",");
    return db
      .prepare(
        `SELECT DISTINCT bt1."BrakeTypeName" AS front, bt2."BrakeTypeName" AS rear,
                ba."BrakeABSName" AS abs
         FROM "VehicleToBrakeConfig" vtb
         JOIN "BrakeConfig" bc ON bc."BrakeConfigID" = vtb."BrakeConfigID"
         LEFT JOIN "BrakeType" bt1 ON bt1."BrakeTypeID" = bc."FrontBrakeTypeID"
         LEFT JOIN "BrakeType" bt2 ON bt2."BrakeTypeID" = bc."RearBrakeTypeID"
         LEFT JOIN "BrakeABS" ba ON ba."BrakeABSID" = bc."BrakeABSID"
         WHERE CAST(vtb."VehicleID" AS INTEGER) IN (${placeholders})`,
      )
      .all(...chunk) as {
      front: string | null;
      rear: string | null;
      abs: string | null;
    }[];
  });

  return {
    engines: uniqueSorted(engineRows.map(engineLabel)),
    transmissions: uniqueSorted(transRows.map(transmissionLabel)),
    driveTypes: uniqueSorted(
      driveRows.map((r) => String(r.name || "").trim()),
    ),
    brakes: uniqueSorted(brakeRows.map(brakeLabel)),
    vehicleIds: ids,
  };
}

function buildSummary(cfg: Omit<VcdbResolvedConfig, "summary" | "matchedAt" | "source">): string {
  const bits = [
    `${cfg.year} ${cfg.make} ${cfg.model}${cfg.submodel ? ` ${cfg.submodel}` : ""}`,
    cfg.engine,
    cfg.fuelGrade,
    cfg.oilCapacity
      ? cfg.oilViscosity
        ? `${cfg.oilCapacity} ${cfg.oilViscosity}`
        : cfg.oilCapacity
      : null,
    cfg.transmission,
    cfg.driveType,
    cfg.brakes,
  ].filter(Boolean);
  return bits.join(" · ");
}

export function resolveConfig(input: VcdbResolveInput): VcdbResolvedConfig {
  const options = listOptions(
    input.year,
    input.make,
    input.model,
    input.submodel,
  );

  const pickFrom = (wanted: string | null | undefined, list: string[]) => {
    if (wanted && list.includes(wanted)) return wanted;
    if (list.length === 1) return list[0];
    return wanted && !isJunkLabel(wanted) ? wanted : list[0] ?? null;
  };

  const engine = pickFrom(input.engine, options.engines);
  const transmission = pickFrom(input.transmission, options.transmissions);
  const driveType = pickFrom(input.driveType, options.driveTypes);
  const brakes = pickFrom(input.brakes, options.brakes);

  const base = {
    vehicleId: options.vehicleIds[0] ?? null,
    year: input.year,
    make: input.make,
    model: input.model,
    submodel: input.submodel?.trim() || null,
    engine,
    transmission,
    driveType,
    brakes,
  };

  const fluids = lookupFluidSpecs({
    year: base.year,
    make: base.make,
    model: base.model,
    submodel: base.submodel,
    engine: base.engine,
  });

  return {
    source: "vcdb",
    ...base,
    fuelGrade: fluids?.fuelGrade ?? null,
    oilCapacity: fluids?.oilCapacity ?? null,
    oilViscosity: fluids?.oilViscosity ?? null,
    summary: buildSummary({
      ...base,
      fuelGrade: fluids?.fuelGrade ?? null,
      oilCapacity: fluids?.oilCapacity ?? null,
      oilViscosity: fluids?.oilViscosity ?? null,
    }),
    matchedAt: new Date().toISOString(),
  };
}
