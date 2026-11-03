/**
 * Private per-vehicle owner's manuals (user_id × vehicle_id only).
 * Never written to knowledge_base / global RAG.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { VehicleInfo } from "@/lib/types/chat";
import { ragService } from "@/lib/rag";
import { rerankManualHitsByHeading } from "@/lib/vehicle-manual-intent";
import {
  persistOilExtractCandidates,
  supersedeExtractsForVehicle,
  clearManualConfirmedFluids,
} from "@/lib/vehicle-manual-extract";
import { logManualObserve } from "@/lib/manual-observe";

type PdfParseCtor = {
  new (opts: { data: Uint8Array }): {
    getText: () => Promise<{
      text?: string;
      pages?: Array<{ num: number; text?: string }>;
    }>;
    destroy: () => Promise<void>;
  };
  setWorker: (workerSrc: string) => void;
};

let pdfParseMod: PdfParseCtor | null = null;
let pdfWorkerConfigured = false;

/**
 * pdfjs (via pdf-parse) expects browser canvas globals. Vercel Node has none —
 * polyfill just enough so module evaluation does not throw DOMMatrix.
 * Lazy-import so GET /manual status does not load pdfjs at all.
 */
function ensurePdfjsNodePolyfills() {
  const g = globalThis as Record<string, unknown>;
  if (typeof g.DOMMatrix === "undefined") {
    g.DOMMatrix = class DOMMatrix {
      a = 1;
      b = 0;
      c = 0;
      d = 1;
      e = 0;
      f = 0;
    };
  }
  if (typeof g.ImageData === "undefined") {
    g.ImageData = class ImageData {
      data: Uint8ClampedArray;
      width: number;
      height: number;
      constructor(sw: number, sh: number) {
        this.width = sw;
        this.height = sh;
        this.data = new Uint8ClampedArray(sw * sh * 4);
      }
    };
  }
  if (typeof g.Path2D === "undefined") {
    g.Path2D = class Path2D {};
  }
}

async function loadPdfParse(): Promise<PdfParseCtor> {
  if (pdfParseMod) return pdfParseMod;
  ensurePdfjsNodePolyfills();
  const mod = await import("pdf-parse");
  pdfParseMod = (mod as { PDFParse: PdfParseCtor }).PDFParse;
  return pdfParseMod;
}

/** Next.js turbopack cannot resolve pdfjs fake-worker; pin worker to package file. */
async function ensurePdfWorker(PDFParse: PdfParseCtor) {
  if (pdfWorkerConfigured) return;
  const candidates = [
    path.join(
      process.cwd(),
      "node_modules/pdf-parse/dist/pdf-parse/esm/pdf.worker.mjs",
    ),
    path.join(process.cwd(), "node_modules/pdf-parse/dist/worker/pdf.worker.mjs"),
    path.join(
      process.cwd(),
      "node_modules/pdf-parse/dist/pdf-parse/web/pdf.worker.mjs",
    ),
  ];
  for (const workerPath of candidates) {
    try {
      PDFParse.setWorker(pathToFileURL(workerPath).href);
      pdfWorkerConfigured = true;
      return;
    } catch {
      /* try next */
    }
  }
}

export const VEHICLE_MANUAL_BUCKET = "vehicle-manuals";
export const VEHICLE_MANUAL_MAX_BYTES = 40 * 1024 * 1024; // 40 MB
export const VEHICLE_MANUAL_MAX_PAGES = 400;
export const USER_MANUAL_SOURCE_LINE =
  "Source: Your uploaded manual (not OEM-verified by Garage Genius).";

const TARGET_CHARS = 1400;
const OVERLAP_CHARS = 120;
/** Short oil-spec excerpts (one page of capacities) must still index. */
const MIN_CHUNK_CHARS = 80;

export type ManualStatus = "processing" | "ready" | "failed";
export type ManualYmmMatch = "match" | "mismatch" | "unknown";

export type ManualYmmGuess = {
  year?: number | null;
  make?: string | null;
  model?: string | null;
};

export type VehicleManualRow = {
  id: string;
  user_id: string;
  vehicle_id: string;
  storage_path: string;
  original_filename: string;
  file_size: number;
  page_count: number | null;
  status: ManualStatus;
  error_message: string | null;
  ymm_guess: ManualYmmGuess | null;
  ymm_match: ManualYmmMatch;
  user_confirmed_match: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ManualChunkHit = {
  id: string;
  manualId: string;
  pageFrom: number | null;
  pageTo: number | null;
  heading: string | null;
  content: string;
  rank: number;
};

export function isManualSearchable(row: Pick<
  VehicleManualRow,
  "status" | "ymm_match" | "user_confirmed_match" | "deleted_at"
>): boolean {
  if (row.deleted_at) return false;
  if (row.status !== "ready") return false;
  if (row.ymm_match === "match" || row.ymm_match === "unknown") return true;
  return Boolean(row.user_confirmed_match);
}

export function storagePathForManual(opts: {
  userId: string;
  vehicleId: string;
  manualId: string;
}): string {
  return `${opts.userId}/${opts.vehicleId}/${opts.manualId}.pdf`;
}

function cleanText(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
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
  }
  return null;
}

function splitOversized(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const out: string[] = [];
  for (let i = 0; i < text.length; i += maxChars - OVERLAP_CHARS) {
    const piece = text.slice(i, i + maxChars).trim();
    if (piece.length >= MIN_CHUNK_CHARS) out.push(piece);
  }
  return out;
}

export type ManualPage = { page: number; text: string };

export async function extractManualPages(
  bytes: Buffer | Uint8Array,
): Promise<ManualPage[]> {
  const PDFParse = await loadPdfParse();
  await ensurePdfWorker(PDFParse);
  const parser = new PDFParse({ data: new Uint8Array(bytes) });
  try {
    const result = await parser.getText();
    if (result.pages?.length) {
      const fromPages = result.pages
        .map((p) => ({ page: p.num, text: p.text || "" }))
        .filter((p) => cleanText(p.text).length > 0);
      if (fromPages.length) return fromPages;
    }
    const text = result.text || "";
    const parts = text.includes("\f") ? text.split("\f") : [text];
    return parts
      .map((t, i) => ({ page: i + 1, text: t }))
      .filter((p) => cleanText(p.text).length > 0);
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

export type BuiltChunk = {
  chunkIndex: number;
  pageFrom: number;
  pageTo: number;
  heading: string | null;
  content: string;
};

export function chunkManualPages(pages: ManualPage[]): BuiltChunk[] {
  const chunks: BuiltChunk[] = [];
  let chunkIndex = 0;
  let pageStart = pages[0]?.page ?? 1;
  let pageEnd = pageStart;
  let buffer = "";

  const pushBuffer = () => {
    const cleaned = cleanText(buffer);
    buffer = "";
    if (cleaned.length < MIN_CHUNK_CHARS) return;
    for (const piece of splitOversized(cleaned, TARGET_CHARS)) {
      chunks.push({
        chunkIndex,
        pageFrom: pageStart,
        pageTo: pageEnd,
        heading: detectHeading(piece),
        content: piece,
      });
      chunkIndex += 1;
    }
  };

  for (const page of pages) {
    const pageText = cleanText(page.text);
    // Skip near-empty pages (covers/blanks) so page ranges stay meaningful.
    // Keep a low floor so short but real oil-spec excerpts still index.
    if (pageText.length < 24) continue;
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

/** Best-effort YMM guess from cover / early pages (no VIN). */
export function guessYmmFromManualText(text: string): ManualYmmGuess {
  const sample = text.slice(0, 12_000);
  const yearHit = sample.match(
    /\b((?:19|20)\d{2})\s+(Toyota|Honda|Ford|Chevrolet|Chevy|Nissan|Hyundai|Kia|BMW|Mercedes(?:-Benz)?|Volkswagen|VW|Subaru|Mazda|Lexus|GMC|Ram|Jeep|Dodge|Audi|Volvo|Tesla)\b/i,
  );
  const alt = sample.match(
    /\b(Toyota|Honda|Ford|Chevrolet|Chevy|Nissan|Hyundai|Kia|BMW|Mercedes(?:-Benz)?|Volkswagen|VW|Subaru|Mazda|Lexus|GMC|Ram|Jeep|Dodge|Audi|Volvo|Tesla)\s+([A-Za-z0-9][A-Za-z0-9\- ]{1,24}?)\s+(?:Owner'?s?\s+Manual|OM)\b/i,
  );
  const year =
    yearHit?.[1] != null
      ? Number(yearHit[1])
      : (() => {
          const y = sample.match(/\b(20\d{2}|19\d{2})\b/);
          return y ? Number(y[1]) : null;
        })();
  let make = yearHit?.[2] || alt?.[1] || null;
  let model: string | null = null;
  if (yearHit) {
    const after = sample.slice(sample.indexOf(yearHit[0]) + yearHit[0].length);
    const m = after.match(/^\s*([A-Za-z0-9][A-Za-z0-9\- ]{1,24}?)(?:\s+Owner|\s+OM|\n|,)/);
    model = m?.[1]?.trim() || null;
  } else if (alt?.[2]) {
    model = alt[2].trim();
  }
  if (make?.toLowerCase() === "chevy") make = "Chevrolet";
  if (make?.toLowerCase() === "vw") make = "Volkswagen";
  if (make?.toLowerCase() === "mercedes-benz") make = "Mercedes-Benz";
  return {
    year: Number.isFinite(year) ? year : null,
    make: make ? make.charAt(0).toUpperCase() + make.slice(1) : null,
    model: model || null,
  };
}

export function compareManualYmmToVehicle(
  guess: ManualYmmGuess,
  vehicle: Pick<VehicleInfo, "year" | "make" | "model">,
): ManualYmmMatch {
  const gMake = (guess.make || "").trim().toLowerCase();
  const gModel = (guess.model || "").trim().toLowerCase();
  const vMake = (vehicle.make || "").trim().toLowerCase();
  const vModel = (vehicle.model || "").trim().toLowerCase();
  const gYear = guess.year ?? null;
  const vYear = Number(vehicle.year) || null;

  if (!gMake && !gModel && !gYear) return "unknown";

  const makeOk = !gMake || !vMake || gMake === vMake || vMake.includes(gMake) || gMake.includes(vMake);
  const modelOk =
    !gModel ||
    !vModel ||
    gModel === vModel ||
    vModel.includes(gModel) ||
    gModel.includes(vModel);
  const yearOk = !gYear || !vYear || Math.abs(gYear - vYear) <= 1;

  if (!makeOk || !modelOk || !yearOk) {
    // Only call mismatch when we have a confident conflicting token.
    if ((gMake && vMake && !makeOk) || (gModel && vModel && !modelOk)) {
      return "mismatch";
    }
    if (gYear && vYear && Math.abs(gYear - vYear) >= 3) return "mismatch";
    return "unknown";
  }
  if (gMake && gModel) return "match";
  return "unknown";
}

export function formatUserManualForPrompt(hits: ManualChunkHit[]): string {
  if (!hits.length) return "";
  const blocks = hits.map((h, i) => {
    const pages =
      h.pageFrom != null
        ? h.pageTo != null && h.pageTo !== h.pageFrom
          ? `pp. ${h.pageFrom}–${h.pageTo}`
          : `p. ${h.pageFrom}`
        : "page n/a";
    const head = h.heading ? ` · ${h.heading.slice(0, 80)}` : "";
    const body = h.content.replace(/\s+/g, " ").trim().slice(0, 900);
    return `[USER_MANUAL #${i + 1} · ${pages}${head}]\n${body}\n${USER_MANUAL_SOURCE_LINE}`;
  });
  return [
    "## User-uploaded owner's manual (private · this vehicle only)",
    "Treat [USER_MANUAL] as the owner's copy of their manual (REPORTED evidence, not OEM-certified by Garage Genius).",
    "Prefer it for capacities / procedures when relevant. Safety stop-rules still win on conflict.",
    "If YMM may not match, tell the owner to verify. Never claim Garage Genius certified this PDF.",
    "Cite briefly as \"Your manual\" / the Source line below — do not invent pages that were not retrieved.",
    "",
    ...blocks,
  ].join("\n");
}

/** Figures from retrieved manual text that may unlock the S4 allowlist this turn. */
export function extractManualSpecAllowlist(hits: ManualChunkHit[]): {
  oilCapacity?: string;
  oilViscosity?: string;
  torqueSpec?: string;
} {
  const blob = hits.map((h) => h.content).join("\n");
  const oilCapacity = blob.match(/\b\d+(?:\.\d+)?\s*(?:qts?|quarts?|liters?|litres)\b/i)?.[0];
  const oilViscosity = blob.match(/\b\d+\s*w\s*-?\s*\d+\b/i)?.[0];
  const torqueSpec = blob.match(
    /\b\d+(?:\.\d+)?\s*(?:ft-?lbs?|foot[-\s]?pounds?|n[·.\s-]*m)\b/i,
  )?.[0];
  return {
    oilCapacity: oilCapacity || undefined,
    oilViscosity: oilViscosity || undefined,
    torqueSpec: torqueSpec || undefined,
  };
}

export async function getActiveVehicleManual(
  client: SupabaseClient,
  userId: string,
  vehicleId: string,
): Promise<VehicleManualRow | null> {
  const { data, error } = await client
    .from("vehicle_manuals")
    .select("*")
    .eq("user_id", userId)
    .eq("vehicle_id", vehicleId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as VehicleManualRow | null) ?? null;
}

export async function softDeleteVehicleManual(opts: {
  client: SupabaseClient;
  userId: string;
  vehicleId: string;
  removeStorage?: boolean;
}): Promise<VehicleManualRow | null> {
  const existing = await getActiveVehicleManual(
    opts.client,
    opts.userId,
    opts.vehicleId,
  );
  if (!existing) return null;

  await supersedeExtractsForVehicle({
    client: opts.client,
    userId: opts.userId,
    vehicleId: opts.vehicleId,
    manualId: existing.id,
  }).catch(() => undefined);
  await clearManualConfirmedFluids({
    client: opts.client,
    userId: opts.userId,
    vehicleId: opts.vehicleId,
  }).catch(() => undefined);

  await opts.client
    .from("vehicle_manual_chunks")
    .delete()
    .eq("manual_id", existing.id)
    .eq("user_id", opts.userId);

  // Soft-delete via service role after ownership was proven by the user-scoped
  // getActiveVehicleManual above. Some DBs still have UPDATE WITH CHECK
  // requiring deleted_at IS NULL (migration 058 recreates policies).
  const { createSupabaseAdmin } = await import("@/lib/supabase-admin");
  const admin = createSupabaseAdmin();
  const { error } = await admin
    .from("vehicle_manuals")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", existing.id)
    .eq("user_id", opts.userId);
  if (error) throw error;

  if (opts.removeStorage !== false && existing.storage_path) {
    await opts.client.storage
      .from(VEHICLE_MANUAL_BUCKET)
      .remove([existing.storage_path])
      .catch(() => undefined);
  }
  return {
    ...existing,
    deleted_at: new Date().toISOString(),
  };
}

export async function retrieveVehicleManualHits(opts: {
  client: SupabaseClient;
  userId: string;
  vehicleId: string;
  query: string;
  limit?: number;
}): Promise<ManualChunkHit[]> {
  const manual = await getActiveVehicleManual(
    opts.client,
    opts.userId,
    opts.vehicleId,
  );
  if (!manual || !isManualSearchable(manual)) return [];

  const q = opts.query.trim().slice(0, 500);
  if (!q) return [];
  const limit = Math.max(1, Math.min(opts.limit ?? 4, 5));

  const { data, error } = await opts.client.rpc("match_vehicle_manual_chunks", {
    p_user_id: opts.userId,
    p_vehicle_id: opts.vehicleId,
    p_query: q,
    p_limit: limit,
  });

  if (!error && Array.isArray(data) && data.length) {
    const mapped = data.map((row: Record<string, unknown>) => ({
      id: String(row.id),
      manualId: String(row.manual_id),
      pageFrom: (row.page_from as number | null) ?? null,
      pageTo: (row.page_to as number | null) ?? null,
      heading: (row.heading as string | null) ?? null,
      content: String(row.content || ""),
      rank: Number(row.rank) || 0,
    }));
    return rerankManualHitsByHeading(mapped, limit);
  }

  // Fallback: keyword scan within this user×vehicle only (never global).
  const { data: rows, error: err2 } = await opts.client
    .from("vehicle_manual_chunks")
    .select("id, manual_id, page_from, page_to, heading, content")
    .eq("user_id", opts.userId)
    .eq("vehicle_id", opts.vehicleId)
    .eq("manual_id", manual.id)
    .limit(120);
  if (err2 || !rows?.length) return [];

  const terms = q
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2)
    .slice(0, 12);
  const scored = rows
    .map((r) => {
      const text = `${r.heading || ""} ${r.content}`.toLowerCase();
      let score = 0;
      for (const t of terms) {
        if (text.includes(t)) score += 1;
      }
      return { r, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);

  const mapped = scored.map(({ r, score }) => ({
    id: r.id as string,
    manualId: r.manual_id as string,
    pageFrom: (r.page_from as number | null) ?? null,
    pageTo: (r.page_to as number | null) ?? null,
    heading: (r.heading as string | null) ?? null,
    content: String(r.content || ""),
    rank: score,
  }));
  return rerankManualHitsByHeading(mapped, limit);
}

export async function processUploadedManual(opts: {
  client: SupabaseClient;
  userId: string;
  vehicleId: string;
  manualId: string;
  bytes: Buffer;
  vehicle: Pick<VehicleInfo, "year" | "make" | "model">;
  skipEmbeddings?: boolean;
}): Promise<VehicleManualRow> {
  const pages = await extractManualPages(opts.bytes);
  if (!pages.length) {
    const { data, error } = await opts.client
      .from("vehicle_manuals")
      .update({
        status: "failed",
        error_message:
          "No extractable text. Text-layer PDFs work best (scanned pages need OCR later).",
        page_count: 0,
      })
      .eq("id", opts.manualId)
      .eq("user_id", opts.userId)
      .select("*")
      .single();
    if (error) throw error;
    logManualObserve(
      "process_failed",
      { reason: "no_text", pageCount: 0, chunkCount: 0 },
      { userId: opts.userId },
    );
    return data as VehicleManualRow;
  }
  if (pages.length > VEHICLE_MANUAL_MAX_PAGES) {
    const { data, error } = await opts.client
      .from("vehicle_manuals")
      .update({
        status: "failed",
        error_message: `PDF has ${pages.length} pages (max ${VEHICLE_MANUAL_MAX_PAGES}). Split or use a shorter manual.`,
        page_count: pages.length,
      })
      .eq("id", opts.manualId)
      .eq("user_id", opts.userId)
      .select("*")
      .single();
    if (error) throw error;
    logManualObserve(
      "process_failed",
      { reason: "too_many_pages", pageCount: pages.length, chunkCount: 0 },
      { userId: opts.userId },
    );
    return data as VehicleManualRow;
  }

  const guess = guessYmmFromManualText(
    pages
      .slice(0, 8)
      .map((p) => p.text)
      .join("\n"),
  );
  const ymmMatch = compareManualYmmToVehicle(guess, opts.vehicle);
  const built = chunkManualPages(pages);
  if (!built.length) {
    const { data, error } = await opts.client
      .from("vehicle_manuals")
      .update({
        status: "failed",
        error_message:
          "PDF text was too sparse to index. Try a text-layer PDF with fuller pages.",
        page_count: pages.length,
        ymm_guess: guess,
        ymm_match: ymmMatch,
      })
      .eq("id", opts.manualId)
      .eq("user_id", opts.userId)
      .select("*")
      .single();
    if (error) throw error;
    logManualObserve(
      "process_sparse",
      {
        reason: "no_chunks",
        pageCount: pages.length,
        chunkCount: 0,
        ymmMatch,
      },
      { userId: opts.userId },
    );
    return data as VehicleManualRow;
  }

  await opts.client
    .from("vehicle_manual_chunks")
    .delete()
    .eq("manual_id", opts.manualId)
    .eq("user_id", opts.userId);

  const rows = [];
  for (const ch of built) {
    let embedding: number[] | null = null;
    if (!opts.skipEmbeddings) {
      try {
        embedding = await ragService.generateEmbedding(
          `${ch.heading || ""}\n${ch.content}`.slice(0, 2000),
        );
        if (embedding && embedding.length !== 1536) embedding = null;
      } catch {
        embedding = null;
      }
    }
    rows.push({
      manual_id: opts.manualId,
      user_id: opts.userId,
      vehicle_id: opts.vehicleId,
      chunk_index: ch.chunkIndex,
      page_from: ch.pageFrom,
      page_to: ch.pageTo,
      heading: ch.heading,
      content: ch.content,
      embedding,
    });
  }

  // Insert in batches
  for (let i = 0; i < rows.length; i += 40) {
    const slice = rows.slice(i, i + 40);
    const { error } = await opts.client.from("vehicle_manual_chunks").insert(slice);
    if (error) throw error;
  }

  const { data, error } = await opts.client
    .from("vehicle_manuals")
    .update({
      status: "ready",
      error_message: null,
      page_count: pages.length,
      ymm_guess: guess,
      ymm_match: ymmMatch,
      user_confirmed_match: ymmMatch === "match",
    })
    .eq("id", opts.manualId)
    .eq("user_id", opts.userId)
    .select("*")
    .single();
  if (error) throw error;
  const ready = data as VehicleManualRow;
  await persistOilExtractCandidates({
    client: opts.client,
    userId: opts.userId,
    vehicleId: opts.vehicleId,
    manualId: opts.manualId,
    chunks: built,
  }).catch(() => undefined);
  logManualObserve(
    "process_ready",
    {
      pageCount: pages.length,
      chunkCount: built.length,
      ymmMatch,
      searchable: isManualSearchable(ready),
    },
    { userId: opts.userId },
  );
  if (ymmMatch === "mismatch") {
    logManualObserve("mismatch", { ymmMatch }, { userId: opts.userId });
  }
  return ready;
}

export function toManualClientDto(row: VehicleManualRow) {
  return {
    id: row.id,
    vehicleId: row.vehicle_id,
    filename: row.original_filename,
    fileSize: row.file_size,
    pageCount: row.page_count,
    status: row.status,
    errorMessage: row.error_message,
    ymmGuess: row.ymm_guess,
    ymmMatch: row.ymm_match,
    userConfirmedMatch: row.user_confirmed_match,
    searchable: isManualSearchable(row),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Spec-ish user questions that benefit from an uploaded manual. */
export function isManualSpecQuestion(text: string): boolean {
  return /\b(quart|quarts|capacity|viscosit|0w-?\d+|5w-?\d+|torque|ft-?lb|n·?m|oil type|how much oil|fill cap|drain plug torque|coolant capacit|spec(?:ification)?s?)\b/i.test(
    text,
  );
}
