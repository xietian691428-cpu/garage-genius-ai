/**
 * Garage Genius AI — Knowledge Base seed / import script
 *
 * Workflow (PROJECT.md Phase 1–2 RAG):
 * 1. You send DIY repair / TSB / diagnostic training data (JSON, CSV notes, or markdown).
 * 2. We normalize it into KnowledgeSeedItem[] below (or scripts/data/knowledge-seed.json).
 * 3. Run: npm run seed:knowledge
 * 4. Rows land in Supabase `knowledge_base` (+ embeddings when provider is available).
 * 5. Chat RAG retrieves them → better DIY answers for US/EU users.
 *
 * Later (Phase 3): the same corpus can feed LoRA fine-tuning — keep sources clean.
 *
 * Usage:
 *   npm run seed:knowledge
 *   npm run seed:knowledge -- --skip-embeddings   # insert text only (Admin can reindex later)
 *   npm run seed:knowledge -- --file=scripts/data/knowledge-seed.json
 *   npm run seed:knowledge -- --file=scripts/data/knowledge-seed.json --file-only
 *   npm run seed:knowledge -- --file=... --file-only --only-new   # skip rows already in DB
 *
 * Owner reviews (JSONL → English knowledge rows, upsert by metadata.ingest_key):
 *   npm run seed:owner-reviews / :text       # insert missing only (--only-new)
 *   npm run seed:owner-reviews:force / :text:force  # rewrite existing rows too
 *
 * Autodata packs (DTC EN + CarRepairQA ZH):
 *   npm run seed:autodata:text               # both, text-only, --only-new (batched)
 *   npm run seed:dtc:text / seed:car-repair-qa:text
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { ragService } from "@/lib/rag";

/** Canonical shape for every knowledge row we import. */
export type KnowledgeSeedItem = {
  title: string;
  content: string;
  /** e.g. tsb | manual | diagnostics | forum | oem | user_feedback */
  source?: string;
  vehicle_make?: string | null;
  vehicle_model?: string | null;
  /** e.g. "2015-2021" or "2018" */
  vehicle_years?: string | null;
  /** e.g. engine | brake | electrical | suspension | general */
  category?: string;
  metadata?: Record<string, unknown>;
  is_active?: boolean;
};

// ─── Built-in starter corpus (extend here OR use --file=...) ─────────────────
const BUILTIN_KNOWLEDGE: KnowledgeSeedItem[] = [
  {
    title: "2018 Toyota Camry Rough Idle TSB",
    content:
      "Common cause: Dirty MAF sensor or throttle body. Cleaning procedure: inspect intake leaks, clean MAF using sensor-safe cleaner, clean throttle body plate and bore, perform idle relearn. If symptoms persist, check fuel trims and spark plugs. DIY difficulty: moderate. Seek a shop if fuel trims stay extreme after cleaning.",
    source: "tsb",
    vehicle_make: "Toyota",
    vehicle_model: "Camry",
    vehicle_years: "2018-2020",
    category: "engine",
    metadata: { severity: "common", fix_cost: "low", region: "US/EU" },
  },
  {
    title: "Brake Pad Replacement Guide - Toyota Camry",
    content:
      "Recommended OEM: Toyota 04465-0E010. Aftermarket: Bosch BC1321. Torque specs: front caliper bracket bolts typically 79 ft-lb (verify per trim), wheel lug nuts 76 ft-lb. Bed-in procedure: 8-10 moderate stops from 40 mph. Always support the vehicle safely on jack stands. Not professional mechanic advice.",
    source: "manual",
    vehicle_make: "Toyota",
    vehicle_model: "Camry",
    vehicle_years: "2015-2021",
    category: "brake",
    metadata: { difficulty: "moderate", tools: ["jack", "torque wrench", "C-clamp"] },
  },
  {
    title: "Toyota Camry Battery Drain Diagnostics",
    content:
      "Parasitic draw over 50mA after sleep may indicate trunk light switch, aftermarket dash cam wiring, or door module wake-up issue. Use clamp meter + fuse pull method to isolate circuit. Confirm battery health and charging voltage (13.8–14.7V running) before chasing modules.",
    source: "diagnostics",
    vehicle_make: "Toyota",
    vehicle_model: "Camry",
    vehicle_years: "2016-2022",
    category: "electrical",
    metadata: { severity: "moderate", fix_cost: "medium" },
  },
  {
    title: "Honda Civic Check Engine P0420 DIY Path",
    content:
      "P0420 (catalyst efficiency below threshold) on Civic: first verify no exhaust leaks upstream of O2 sensors, check for misfires and rich/lean conditions, inspect upstream/downstream O2 sensor waveforms. Do not replace catalytic converter until root causes are ruled out. Confirm with freeze-frame data and readiness monitors.",
    source: "diagnostics",
    vehicle_make: "Honda",
    vehicle_model: "Civic",
    vehicle_years: "2012-2021",
    category: "engine",
    metadata: { dtc: "P0420", region: "US/EU" },
  },
  {
    title: "Ford F-150 Spark Plug Replacement Notes",
    content:
      "On EcoBoost and 5.0 Coyote applications, use correct heat-range plugs and torque to OEM spec. Anti-seize is usually not required on nickel-plated plugs (follow Ford TSB for your year). Inspect coil boots for carbon tracking. Clear misfire codes and road-test under load.",
    source: "manual",
    vehicle_make: "Ford",
    vehicle_model: "F-150",
    vehicle_years: "2015-2023",
    category: "engine",
    metadata: { difficulty: "moderate" },
  },
];

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}. Load via: npm run seed:knowledge (uses .env.local)`);
  }
  return value;
}

function createSeedClient() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!key) {
    throw new Error(
      "Need SUPABASE_SERVICE_ROLE_KEY (preferred) or NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn(
      "⚠️  Using anon key — inserts may fail under RLS. Prefer SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function parseArgs(argv: string[]) {
  const skipEmbeddings = argv.includes("--skip-embeddings");
  const fileOnly = argv.includes("--file-only");
  const onlyNew =
    argv.includes("--only-new") ||
    // Owner-review npm scripts default to only-new unless --force-update
    (argv.includes("--owner-reviews-default-only-new") &&
      !argv.includes("--force-update"));
  const forceUpdate = argv.includes("--force-update");
  const fileArg = argv.find((a) => a.startsWith("--file="));
  const file = fileArg?.slice("--file=".length);
  const batchArg = argv.find((a) => a.startsWith("--batch="));
  const batchRaw = batchArg ? Number(batchArg.slice("--batch=".length)) : 0;
  // Default batch size for text-only inserts (large corpora). Embeddings stay row-by-row.
  const batchSize =
    Number.isFinite(batchRaw) && batchRaw > 0
      ? Math.min(Math.floor(batchRaw), 500)
      : skipEmbeddings
        ? 100
        : 1;
  return {
    skipEmbeddings,
    fileOnly,
    file,
    onlyNew: forceUpdate ? false : onlyNew,
    forceUpdate,
    batchSize,
  };
}

function loadFromJsonFile(filePath: string): KnowledgeSeedItem[] {
  const abs = resolve(process.cwd(), filePath);
  if (!existsSync(abs)) {
    throw new Error(`File not found: ${abs}`);
  }
  const raw = JSON.parse(readFileSync(abs, "utf8")) as unknown;
  if (!Array.isArray(raw)) {
    throw new Error("JSON file must be an array of KnowledgeSeedItem objects");
  }
  return raw as KnowledgeSeedItem[];
}

function normalizeItem(item: KnowledgeSeedItem): KnowledgeSeedItem {
  const title = item.title?.trim();
  const content = item.content?.trim();
  if (!title || !content) {
    throw new Error(`Invalid item (title/content required): ${JSON.stringify(item).slice(0, 120)}`);
  }
  return {
    title,
    content,
    source: item.source?.trim() || "manual",
    vehicle_make: item.vehicle_make?.trim() || null,
    vehicle_model: item.vehicle_model?.trim() || null,
    vehicle_years: item.vehicle_years?.trim() || null,
    category: item.category?.trim() || "general",
    metadata: item.metadata ?? {},
    is_active: item.is_active ?? true,
  };
}

async function maybeEmbedding(
  text: string,
  skip: boolean,
): Promise<number[] | null> {
  if (skip) return null;
  try {
    return await ragService.generateEmbedding(text);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`  ⚠️  Embedding skipped: ${msg}`);
    return null;
  }
}

function ingestKeyOf(item: KnowledgeSeedItem): string | null {
  const raw = item.metadata?.ingest_key;
  if (typeof raw !== "string") return null;
  const key = raw.trim();
  return key || null;
}

async function existingByIngestKey(
  client: ReturnType<typeof createSeedClient>,
  ingestKey: string,
): Promise<{ id: string } | null> {
  const { data, error } = await client
    .from("knowledge_base")
    .select("id")
    .filter("metadata->>ingest_key", "eq", ingestKey)
    .limit(1);

  if (!error && data?.[0]?.id) {
    return { id: data[0].id as string };
  }

  // Legacy fallback: jsonb contains
  const { data: contained } = await client
    .from("knowledge_base")
    .select("id")
    .contains("metadata", { ingest_key: ingestKey })
    .limit(1);
  if (contained?.[0]?.id) return { id: contained[0].id as string };

  return null;
}

/**
 * Prefetch all ingest_keys already in knowledge_base (paginated).
 * Used by --only-new so we don't re-touch the previous 10k+ rows.
 */
async function loadExistingIngestKeys(
  client: ReturnType<typeof createSeedClient>,
): Promise<Set<string>> {
  const keys = new Set<string>();
  const pageSize = 1000;
  let from = 0;

  for (;;) {
    const { data, error } = await client
      .from("knowledge_base")
      .select("metadata")
      .not("metadata->>ingest_key", "is", null)
      .range(from, from + pageSize - 1);

    if (error) {
      // Older PostgREST / missing expression — fall back to source filter + metadata scan
      console.warn(
        `[seed] ingest_key prefetch filter failed (${error.message}); using source=user_feedback scan`,
      );
      return loadExistingIngestKeysBySource(client);
    }

    const rows = data || [];
    for (const row of rows) {
      const m = row.metadata as Record<string, unknown> | null;
      const k = typeof m?.ingest_key === "string" ? m.ingest_key.trim() : "";
      if (k) keys.add(k);
    }

    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return keys;
}

async function loadExistingIngestKeysBySource(
  client: ReturnType<typeof createSeedClient>,
): Promise<Set<string>> {
  const keys = new Set<string>();
  const pageSize = 1000;
  let from = 0;

  for (;;) {
    const { data, error } = await client
      .from("knowledge_base")
      .select("metadata")
      .eq("source", "user_feedback")
      .range(from, from + pageSize - 1);

    if (error) {
      console.warn(`[seed] source scan failed: ${error.message}`);
      break;
    }

    const rows = data || [];
    for (const row of rows) {
      const m = row.metadata as Record<string, unknown> | null;
      const k = typeof m?.ingest_key === "string" ? m.ingest_key.trim() : "";
      if (k) keys.add(k);
    }

    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return keys;
}

async function seedKnowledge() {
  const { skipEmbeddings, fileOnly, file, onlyNew, batchSize } = parseArgs(
    process.argv.slice(2),
  );
  const supabase = createSeedClient();

  const fromFile = file ? loadFromJsonFile(file) : [];
  let items = (
    fileOnly
      ? fromFile
      : file
        ? [...BUILTIN_KNOWLEDGE, ...fromFile]
        : BUILTIN_KNOWLEDGE
  ).map(normalizeItem);

  if (fileOnly && !file) {
    throw new Error("--file-only requires --file=...");
  }

  let skippedExisting = 0;
  let existingKeys: Set<string> | null = null;

  if (onlyNew) {
    console.log(
      "Mode: --only-new (skip rows whose ingest_key is already in DB)",
    );
    existingKeys = await loadExistingIngestKeys(supabase);
    console.log(`  Prefetched ${existingKeys.size} existing ingest_key(s)`);

    const filtered: KnowledgeSeedItem[] = [];
    for (const item of items) {
      const key = ingestKeyOf(item);
      if (key && existingKeys.has(key)) {
        skippedExisting += 1;
        continue;
      }
      filtered.push(item);
    }
    items = filtered;
  }

  const useBatch = skipEmbeddings && onlyNew && batchSize > 1;

  console.log(
    `Seeding ${items.length} knowledge rows` +
      (skippedExisting ? ` (skipped ${skippedExisting} already seeded)` : "") +
      (fileOnly
        ? ` (file only: ${file})`
        : file
          ? ` (builtin + ${file})`
          : " (builtin)") +
      (skipEmbeddings ? " [embeddings OFF]" : " [embeddings ON if provider works]") +
      (useBatch ? ` [batch=${batchSize}]` : ""),
  );

  if (items.length === 0) {
    console.log("\nNothing new to insert. Done.");
    return;
  }

  let inserted = 0;
  let updated = 0;
  let failed = 0;

  if (useBatch) {
    for (let i = 0; i < items.length; i += batchSize) {
      const chunk = items.slice(i, i + batchSize);
      const rows = chunk.map((item) => ({
        title: item.title,
        content: item.content,
        source: item.source,
        vehicle_make: item.vehicle_make,
        vehicle_model: item.vehicle_model,
        vehicle_years: item.vehicle_years,
        category: item.category,
        metadata: item.metadata,
        is_active: item.is_active,
      }));
      try {
        const { error } = await supabase.from("knowledge_base").insert(rows);
        if (error) throw error;
        inserted += chunk.length;
        for (const item of chunk) {
          const key = ingestKeyOf(item);
          if (key && existingKeys) existingKeys.add(key);
        }
        const end = Math.min(i + chunk.length, items.length);
        if (end % 500 === 0 || end === items.length) {
          console.log(`✅ batch [${end}/${items.length}] inserted (+${chunk.length})`);
        }
      } catch (err) {
        // Fall back to row inserts for this chunk so one bad row doesn't drop 100
        for (const item of chunk) {
          try {
            const { error } = await supabase.from("knowledge_base").insert({
              title: item.title,
              content: item.content,
              source: item.source,
              vehicle_make: item.vehicle_make,
              vehicle_model: item.vehicle_model,
              vehicle_years: item.vehicle_years,
              category: item.category,
              metadata: item.metadata,
              is_active: item.is_active,
            });
            if (error) {
              const key = ingestKeyOf(item);
              if (key && /duplicate|unique|ingest_key/i.test(error.message)) {
                skippedExisting += 1;
                continue;
              }
              throw error;
            }
            inserted += 1;
            const key = ingestKeyOf(item);
            if (key && existingKeys) existingKeys.add(key);
          } catch (rowErr) {
            failed += 1;
            const msg = rowErr instanceof Error ? rowErr.message : String(rowErr);
            console.error(`❌ ${item.title}: ${msg}`);
          }
        }
      }
    }
  } else {
    for (const [index, item] of items.entries()) {
      const n = index + 1;
      try {
        const embedding = await maybeEmbedding(
          `${item.title}\n\n${item.content}`,
          skipEmbeddings,
        );

        const row = {
          title: item.title,
          content: item.content,
          source: item.source,
          vehicle_make: item.vehicle_make,
          vehicle_model: item.vehicle_model,
          vehicle_years: item.vehicle_years,
          category: item.category,
          metadata: item.metadata,
          is_active: item.is_active,
          ...(embedding ? { embedding } : {}),
        };

        const key = ingestKeyOf(item);
        // With --only-new we already filtered; still allow update path when not only-new
        const existing =
          !onlyNew && key ? await existingByIngestKey(supabase, key) : null;

        if (existing) {
          const { error } = await supabase
            .from("knowledge_base")
            .update(row)
            .eq("id", existing.id);
          if (error) throw error;
          updated += 1;
          console.log(`♻️  [${n}/${items.length}] updated ${item.title}`);
        } else {
          const { error } = await supabase.from("knowledge_base").insert(row);
          if (error) {
            if (key && /duplicate|unique|ingest_key/i.test(error.message)) {
              skippedExisting += 1;
              console.log(`⏭  [${n}/${items.length}] already exists ${item.title}`);
              continue;
            }
            throw error;
          }
          inserted += 1;
          if (key && existingKeys) existingKeys.add(key);
          console.log(`✅ [${n}/${items.length}] ${item.title}`);
        }
      } catch (err) {
        failed += 1;
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`❌ [${n}/${items.length}] ${item.title}: ${msg}`);
      }
    }
  }

  console.log(
    `\nDone. Inserted: ${inserted}, Updated: ${updated}, Skipped existing: ${skippedExisting}, Failed: ${failed}`,
  );
  if (failed > 0) process.exitCode = 1;
}

void seedKnowledge().catch((error) => {
  console.error("❌ Seed crashed:", error);
  process.exit(1);
});
