/**
 * Ingest OEM / owner-manual PDFs into knowledge_base for Hybrid RAG.
 *
 * Compatible with:
 *   - knowledge_base (title, content, source, vehicle fields, category, metadata, embedding)
 *   - FTS + vector hybrid (014 soft market filter on metadata.market / region)
 *
 * Copyright: only ingest manuals you are licensed to use.
 *
 * Examples:
 *   npm run ingest:manual -- --file=manuals/camry_us_2023.pdf --market=US --make=Toyota --model=Camry --years=2023
 *   npm run ingest:manual -- --url=https://example.com/manual.pdf --market=US --make=Honda --model=Civic --years=2020
 *   npm run ingest:manual -- --storage=manuals/toyota_camry_2023_US.pdf --market=US --make=Toyota --model=Camry --years=2023
 *   npm run ingest:manual -- --dir=manuals --market=US --skip-embeddings
 *   npm run ingest:manual -- --file=manual.pdf --market=EU --make=VW --model=Golf --force
 */

import { createHash } from "crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { basename, extname, resolve } from "path";
import { PDFParse } from "pdf-parse";
import { ragService } from "@/lib/rag";
import {
  getRegion,
  isVehicleMarketCode,
  normalizeVehicleMarket,
  type VehicleMarketCode,
} from "@/lib/types/vehicle-market";

const SOURCE = "owner_manual";
const TARGET_CHARS = 1400;
const OVERLAP_CHARS = 120;
const MIN_CHUNK_CHARS = 200;

type CliArgs = {
  file?: string;
  url?: string;
  storage?: string;
  dir?: string;
  market: VehicleMarketCode;
  make?: string;
  model?: string;
  years?: string;
  skipEmbeddings: boolean;
  dryRun: boolean;
  force: boolean;
};

type ManualPage = { page: number; text: string };

type ManualChunk = {
  title: string;
  content: string;
  category: string;
  pageStart: number;
  pageEnd: number;
  chunkIndex: number;
  heading: string | null;
  chunkHash: string;
  ingestKey: string;
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}. Run via: npm run ingest:manual (loads .env.local)`);
  }
  return value;
}

function createAdminClient(): SupabaseClient {
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

function parseArgs(argv: string[]): CliArgs {
  const get = (name: string) => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`));
    return hit?.slice(name.length + 3);
  };

  const marketRaw = get("market") || "US";
  if (!isVehicleMarketCode(marketRaw)) {
    throw new Error(
      `Invalid --market=${marketRaw}. Use US|CA|MX|GB|EU|AU|OTHER`,
    );
  }

  return {
    file: get("file"),
    url: get("url"),
    storage: get("storage"),
    dir: get("dir"),
    market: normalizeVehicleMarket(marketRaw),
    make: get("make"),
    model: get("model"),
    years: get("years") || get("year"),
    skipEmbeddings: argv.includes("--skip-embeddings"),
    dryRun: argv.includes("--dry-run"),
    force: argv.includes("--force"),
  };
}

function sha256(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

function cleanText(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function guessCategory(text: string): string {
  const t = text.toLowerCase();
  if (/\b(brake|caliper|pad|rotor|abs)\b/.test(t)) return "brake";
  if (/\b(oil|filter|viscosity|drain plug|fluid capacit)\b/.test(t))
    return "consumable";
  if (/\b(suspension|shock|strut|spring|alignment)\b/.test(t))
    return "suspension";
  if (/\b(battery|fuse|alternator|electrical|wiring)\b/.test(t))
    return "electrical";
  if (/\b(tire|wheel|tpms|pressure)\b/.test(t)) return "tires";
  if (/\b(ac |a\/c|hvac|climate|refrigerant)\b/.test(t)) return "hvac";
  if (/\b(transmission|clutch|cvt|gearbox)\b/.test(t)) return "transmission";
  if (/\b(engine|spark|timing|coolant|radiator|intake)\b/.test(t))
    return "engine";
  return "repair";
}

function detectHeading(text: string): string | null {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 8);

  for (const line of lines) {
    if (line.length < 4 || line.length > 90) continue;
    if (/^(\d+(\.\d+)*|[A-Z])\s+/.test(line)) return line;
    if (
      /^(chapter|section|part|maintenance|specifications?|fluids?|brakes?|engine|warranty)\b/i.test(
        line,
      )
    ) {
      return line;
    }
    if (line === line.toUpperCase() && /[A-Z]/.test(line) && line.length > 8) {
      return line;
    }
  }
  return null;
}

function splitOversized(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];

  const paras = text.split(/\n{2,}/);
  const out: string[] = [];
  let buf = "";

  const flush = () => {
    const t = buf.trim();
    if (t) out.push(t);
    buf = "";
  };

  for (const para of paras) {
    if (!para.trim()) continue;
    if ((buf + "\n\n" + para).length <= maxChars) {
      buf = buf ? `${buf}\n\n${para}` : para;
      continue;
    }
    flush();
    if (para.length <= maxChars) {
      buf = para;
      continue;
    }
    // Hard-split long paragraph on sentence boundaries
    const sentences = para.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [para];
    for (const s of sentences) {
      if ((buf + " " + s).length <= maxChars) {
        buf = buf ? `${buf} ${s.trim()}` : s.trim();
      } else {
        flush();
        if (s.length <= maxChars) {
          buf = s.trim();
        } else {
          for (let i = 0; i < s.length; i += maxChars - OVERLAP_CHARS) {
            out.push(s.slice(i, i + maxChars).trim());
          }
          buf = "";
        }
      }
    }
  }
  flush();
  return out.filter((c) => c.length >= MIN_CHUNK_CHARS);
}

function chunkPages(
  pages: ManualPage[],
  meta: {
    make: string;
    model: string;
    years: string | null;
    market: VehicleMarketCode;
    docId: string;
  },
): ManualChunk[] {
  const chunks: ManualChunk[] = [];
  let chunkIndex = 0;

  // Merge consecutive short pages toward TARGET_CHARS
  let pageStart = pages[0]?.page ?? 1;
  let pageEnd = pageStart;
  let buffer = "";

  const pushBuffer = () => {
    const cleaned = cleanText(buffer);
    buffer = "";
    if (cleaned.length < MIN_CHUNK_CHARS) return;

    for (const piece of splitOversized(cleaned, TARGET_CHARS)) {
      const heading = detectHeading(piece);
      const ymm = [meta.years, meta.make, meta.model].filter(Boolean).join(" ");
      const titleBits = [
        ymm || `${meta.make} ${meta.model}`,
        `Owner Manual (${meta.market})`,
        heading ? heading.slice(0, 60) : `pp. ${pageStart}-${pageEnd}`,
      ];
      const title = titleBits.join(" — ");
      const content = [
        `[Owner manual · ${meta.market} market]`,
        heading ? `Section: ${heading}` : null,
        `Pages: ${pageStart}-${pageEnd}`,
        "",
        piece,
        "",
        "Verify torque / capacities / procedures in the official owner's manual for your VIN / market.",
      ]
        .filter((x) => x !== null)
        .join("\n");

      const chunkHash = sha256(
        `${meta.docId}|${chunkIndex}|${pageStart}|${pageEnd}|${piece}`,
      );
      chunks.push({
        title,
        content,
        category: guessCategory(piece),
        pageStart,
        pageEnd,
        chunkIndex,
        heading,
        chunkHash,
        ingestKey: `${meta.docId}:${chunkIndex}`,
      });
      chunkIndex += 1;
    }
  };

  for (const page of pages) {
    const pageText = cleanText(page.text);
    if (!pageText) continue;

    if (!buffer) {
      pageStart = page.page;
      pageEnd = page.page;
      buffer = pageText;
      continue;
    }

    if ((buffer + "\n\n" + pageText).length <= TARGET_CHARS) {
      buffer = `${buffer}\n\n${pageText}`;
      pageEnd = page.page;
      continue;
    }

    pushBuffer();
    pageStart = page.page;
    pageEnd = page.page;
    buffer = pageText;
  }
  pushBuffer();

  return chunks;
}

async function loadPdfBytes(args: {
  file?: string;
  url?: string;
  storage?: string;
  client: SupabaseClient;
}): Promise<{ bytes: Buffer; label: string }> {
  if (args.file) {
    const abs = resolve(process.cwd(), args.file);
    if (!existsSync(abs)) {
      const manualsDir = resolve(process.cwd(), "manuals");
      const hint = existsSync(manualsDir)
        ? `\n  Tip: put the PDF in ./manuals/ first, e.g.\n` +
          `    cp ~/Downloads/your_manual.pdf ${manualsDir}/toyota_camry_2023_US.pdf\n` +
          `  Then re-run the same command.`
        : "";
      throw new Error(`File not found: ${abs}${hint}`);
    }
    return { bytes: readFileSync(abs), label: basename(abs) };
  }

  if (args.url) {
    const res = await fetch(args.url);
    if (!res.ok) {
      throw new Error(`Failed to download URL (${res.status}): ${args.url}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const name =
      basename(new URL(args.url).pathname) || `remote-${sha256(args.url).slice(0, 8)}.pdf`;
    return { bytes: buf, label: name };
  }

  if (args.storage) {
    // bucket/path/to/file.pdf  OR  just path (default bucket: manuals)
    const raw = args.storage.replace(/^\/+/, "");
    const slash = raw.indexOf("/");
    const bucket = slash === -1 ? "manuals" : raw.slice(0, slash);
    const path = slash === -1 ? raw : raw.slice(slash + 1);
    const { data, error } = await args.client.storage.from(bucket).download(path);
    if (error || !data) {
      throw new Error(
        `Storage download failed (${bucket}/${path}): ${error?.message || "no data"}`,
      );
    }
    const buf = Buffer.from(await data.arrayBuffer());
    return { bytes: buf, label: basename(path) };
  }

  throw new Error("Provide --file, --url, or --storage");
}

async function extractPages(bytes: Buffer): Promise<ManualPage[]> {
  const parser = new PDFParse({ data: new Uint8Array(bytes) });
  try {
    const result = await parser.getText();
    if (result.pages?.length) {
      return result.pages
        .map((p) => ({ page: p.num, text: p.text || "" }))
        .filter((p) => cleanText(p.text).length > 0);
    }
    // Fallback: split concatenated text on form-feed if present
    const text = result.text || "";
    const parts = text.includes("\f") ? text.split("\f") : [text];
    return parts
      .map((t, i) => ({ page: i + 1, text: t }))
      .filter((p) => cleanText(p.text).length > 0);
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

/** Parse make/model/year/market from filenames like toyota_camry_2023_US.pdf */
function parseFilenameMeta(fileName: string): {
  make?: string;
  model?: string;
  years?: string;
  market?: VehicleMarketCode;
} {
  const base = basename(fileName, extname(fileName));
  const parts = base.split(/[_\-\s]+/).filter(Boolean);
  if (parts.length < 2) return {};

  let market: VehicleMarketCode | undefined;
  let years: string | undefined;
  const rest = [...parts];

  const last = rest[rest.length - 1]?.toUpperCase();
  if (last && isVehicleMarketCode(last)) {
    market = last;
    rest.pop();
  }

  const yearHit = rest.find((p) => /^(19|20)\d{2}(-\d{2,4})?$/.test(p));
  if (yearHit) {
    years = yearHit;
    rest.splice(rest.indexOf(yearHit), 1);
  }

  const make = rest[0]
    ? rest[0].charAt(0).toUpperCase() + rest[0].slice(1).toLowerCase()
    : undefined;
  const model = rest
    .slice(1)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(" ");

  return { make, model: model || undefined, years, market };
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

async function existingByIngestKey(
  client: SupabaseClient,
  ingestKey: string,
): Promise<{ id: string } | null> {
  const { data, error } = await client
    .from("knowledge_base")
    .select("id")
    .contains("metadata", { ingest_key: ingestKey })
    .limit(1);

  if (error) {
    // Fallback: filter via JSON path if contains unsupported
    const { data: rows, error: err2 } = await client
      .from("knowledge_base")
      .select("id, metadata")
      .eq("source", SOURCE)
      .limit(5000);
    if (err2 || !rows) {
      console.warn(`  ⚠️  Idempotency lookup failed: ${error.message}`);
      return null;
    }
    const hit = rows.find((r) => {
      const m = r.metadata as Record<string, unknown> | null;
      return m && m.ingest_key === ingestKey;
    });
    return hit ? { id: hit.id as string } : null;
  }

  return data?.[0] ? { id: data[0].id as string } : null;
}

async function ingestOnePdf(opts: {
  client: SupabaseClient;
  bytes: Buffer;
  label: string;
  market: VehicleMarketCode;
  make: string;
  model: string;
  years: string | null;
  skipEmbeddings: boolean;
  dryRun: boolean;
  force: boolean;
}): Promise<{ inserted: number; updated: number; skipped: number }> {
  const region = getRegion(opts.market);
  const docId = sha256(
    `${opts.label}|${opts.market}|${opts.make}|${opts.model}|${opts.years || ""}|${sha256(opts.bytes)}`,
  );

  console.log(`\n📄 ${opts.label}`);
  console.log(
    `   ${opts.make} ${opts.model}${opts.years ? ` (${opts.years})` : ""} · market ${opts.market} (${region})`,
  );

  const pages = await extractPages(opts.bytes);
  console.log(`   Extracted ${pages.length} text page(s)`);

  const chunks = chunkPages(pages, {
    make: opts.make,
    model: opts.model,
    years: opts.years,
    market: opts.market,
    docId,
  });
  console.log(`   Chunked into ${chunks.length} knowledge row(s)`);

  if (opts.dryRun) {
    for (const c of chunks.slice(0, 3)) {
      console.log(`   [dry-run] ${c.title} (${c.content.length} chars)`);
    }
    if (chunks.length > 3) console.log(`   [dry-run] … +${chunks.length - 3} more`);
    return { inserted: 0, updated: 0, skipped: chunks.length };
  }

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const chunk of chunks) {
    const existing = await existingByIngestKey(opts.client, chunk.ingestKey);
    if (existing && !opts.force) {
      skipped += 1;
      continue;
    }

    const embedding = await maybeEmbedding(
      `${chunk.title}\n\n${chunk.content}`,
      opts.skipEmbeddings,
    );

    const metadata = {
      market: opts.market,
      region,
      source: SOURCE,
      rag_tier: "repair",
      page_start: chunk.pageStart,
      page_end: chunk.pageEnd,
      chunk_index: chunk.chunkIndex,
      chunk_hash: chunk.chunkHash,
      ingest_key: chunk.ingestKey,
      doc_id: docId,
      file_name: opts.label,
      heading: chunk.heading,
      copyright_note:
        "Owner-manual excerpt for licensed DIY coaching — verify against official PDF.",
    };

    const row = {
      title: chunk.title,
      content: chunk.content,
      source: SOURCE,
      vehicle_make: opts.make,
      vehicle_model: opts.model,
      vehicle_years: opts.years,
      category: chunk.category,
      metadata,
      is_active: true,
      ...(embedding ? { embedding } : {}),
    };

    if (existing && opts.force) {
      const { error } = await opts.client
        .from("knowledge_base")
        .update(row)
        .eq("id", existing.id);
      if (error) throw error;
      updated += 1;
      console.log(`  ♻️  [${chunk.chunkIndex + 1}/${chunks.length}] ${chunk.title}`);
    } else {
      const { error } = await opts.client.from("knowledge_base").insert(row);
      if (error) throw error;
      inserted += 1;
      console.log(`  ✅ [${chunk.chunkIndex + 1}/${chunks.length}] ${chunk.title}`);
    }
  }

  return { inserted, updated, skipped };
}

function listPdfFiles(dir: string): string[] {
  const abs = resolve(process.cwd(), dir);
  if (!existsSync(abs) || !statSync(abs).isDirectory()) {
    throw new Error(`Directory not found: ${abs}`);
  }
  return readdirSync(abs)
    .filter((f) => f.toLowerCase().endsWith(".pdf"))
    .map((f) => resolve(abs, f));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const client = createAdminClient();

  const jobs: Array<{
    file?: string;
    url?: string;
    storage?: string;
    make: string;
    model: string;
    years: string | null;
    market: VehicleMarketCode;
  }> = [];

  if (args.dir) {
    const files = listPdfFiles(args.dir);
    if (!files.length) {
      throw new Error(`No PDFs in ${args.dir}`);
    }
    for (const abs of files) {
      const guessed = parseFilenameMeta(abs);
      const make = args.make || guessed.make;
      const model = args.model || guessed.model;
      if (!make || !model) {
        console.warn(
          `⚠️  Skip ${basename(abs)} — need --make/--model or filename like toyota_camry_2023_US.pdf`,
        );
        continue;
      }
      jobs.push({
        file: abs,
        make,
        model,
        years: args.years || guessed.years || null,
        market: guessed.market || args.market,
      });
    }
  } else {
    if (!args.file && !args.url && !args.storage) {
      throw new Error(
        "Usage: --file=path.pdf | --url=https://... | --storage=bucket/path.pdf | --dir=manuals\n" +
          "Required for single file: --market --make --model  (optional --years)",
      );
    }
    if (!args.make || !args.model) {
      throw new Error("--make and --model are required (unless using --dir with named PDFs)");
    }
    jobs.push({
      file: args.file,
      url: args.url,
      storage: args.storage,
      make: args.make,
      model: args.model,
      years: args.years || null,
      market: args.market,
    });
  }

  console.log(
    `Ingesting ${jobs.length} manual(s)` +
      (args.skipEmbeddings ? " [embeddings OFF]" : " [embeddings ON if provider works]") +
      (args.dryRun ? " [DRY RUN]" : "") +
      (args.force ? " [FORCE update]" : ""),
  );

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const job of jobs) {
    const { bytes, label } = await loadPdfBytes({
      file: job.file,
      url: job.url,
      storage: job.storage,
      client,
    });
    const result = await ingestOnePdf({
      client,
      bytes,
      label,
      market: job.market,
      make: job.make,
      model: job.model,
      years: job.years,
      skipEmbeddings: args.skipEmbeddings,
      dryRun: args.dryRun,
      force: args.force,
    });
    inserted += result.inserted;
    updated += result.updated;
    skipped += result.skipped;
  }

  console.log(
    `\nDone. Inserted: ${inserted}, Updated: ${updated}, Skipped (idempotent): ${skipped}`,
  );
}

void main().catch((err) => {
  console.error("❌ ingest-owner-manuals crashed:", err);
  process.exit(1);
});
