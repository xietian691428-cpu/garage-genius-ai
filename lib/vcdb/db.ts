/**
 * AutoCare VCdb SQLite access (server-only).
 * Cache built by: python3 scripts/train/vcdb_sql_to_jsonl.py --rebuild-sqlite ...
 */

import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const CANDIDATE_PATHS = [
  path.join(/*turbopackIgnore: true*/ process.cwd(), "scripts/data/vcdb-cache.sqlite"),
  path.join(/*turbopackIgnore: true*/ process.cwd(), "data/vcdb-cache.sqlite"),
];

let dbSingleton: DatabaseSync | null = null;
let resolvedPath: string | null = null;
let indexed = false;

export function findVcdbSqlitePath(): string | null {
  for (const p of CANDIDATE_PATHS) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export function getVcdbDb(): DatabaseSync | null {
  if (dbSingleton) return dbSingleton;

  const filePath = findVcdbSqlitePath();
  if (!filePath) return null;

  try {
    dbSingleton = new DatabaseSync(filePath, { readOnly: true });
    resolvedPath = filePath;
    ensureIndexes(dbSingleton);
    return dbSingleton;
  } catch (err) {
    console.error("[vcdb] failed to open sqlite:", err);
    dbSingleton = null;
    resolvedPath = null;
    return null;
  }
}

export function getVcdbPath(): string | null {
  return resolvedPath ?? findVcdbSqlitePath();
}

function ensureIndexes(db: DatabaseSync) {
  if (indexed) return;
  indexed = true;
  // readOnly DB cannot create indexes — skip silently
  try {
    // Probe writeability with a no-op; read-only throws
    db.exec(`SELECT 1`);
  } catch {
    /* ignore */
  }
}

export function isJunkLabel(value: string | null | undefined): boolean {
  if (!value) return true;
  const v = value.trim();
  if (!v) return true;
  return ["-", "N/A", "N/R", "U/K", "Unknown", "None"].includes(v);
}
