/**
 * RAG retrieval for chat — hybrid search strategy:
 *   1) FTS (tsvector) — always available, no embedding API needed
 *   2) Optional embedding → match_knowledge_hybrid (RRF fusion)
 *   3) Legacy match_documents / JS keyword fallback as last resort
 */

import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { supabase as browserSupabase } from "@/lib/supabase";
import type { RagKnowledgeHit } from "@/lib/types/rag";
import {
  filterEnglishKnowledgeHits,
  formatKnowledgeForPrompt,
  prioritizeRagHits,
} from "@/lib/rag-prompt";
import {
  getRegion,
  normalizeVehicleMarket,
  type VehicleMarketCode,
} from "@/lib/types/vehicle-market";

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_EMBEDDING_URL = "https://api.deepseek.com/v1/embeddings";
const DEEPSEEK_EMBEDDING_MODEL =
  process.env.DEEPSEEK_EMBEDDING_MODEL || "deepseek-embedding-v1";
/** Keep embedding probe short — chat must not stall on a broken embed endpoint. */
const DEEPSEEK_EMBEDDING_TIMEOUT_MS = 4_000;

/**
 * Process-local circuit: after DeepSeek embeddings fail (e.g. HTTP 404),
 * skip further embed calls for this warm instance and use FTS-only RAG.
 * OpenAI is intentionally not used — product path is DeepSeek-only.
 */
let deepseekEmbeddingDisabledUntil = 0;

export type VehicleFilter = {
  make: string;
  model: string;
  year: number;
  /** Sales-market code — soft-filters knowledge metadata.market / region */
  market?: VehicleMarketCode | string;
};

function getClient() {
  try {
    return createSupabaseAdmin();
  } catch {
    return browserSupabase;
  }
}

/** Payload for match_* RPC `filter` jsonb (make/model + market soft gate). */
function vehicleFilterPayload(vehicle: VehicleFilter) {
  const market = normalizeVehicleMarket(vehicle.market);
  return {
    vehicle_make: vehicle.make,
    vehicle_model: vehicle.model,
    market,
    region: getRegion(market),
  };
}

/** Read market/region tag from a knowledge hit (metadata.market | metadata.region). */
function hitMarketTag(hit: RagKnowledgeHit): string | null {
  const meta = hit.metadata || {};
  const raw = meta.market ?? meta.region;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().toUpperCase();
  return trimmed || null;
}

function isUniversalMarketTag(tag: string | null): boolean {
  return !tag || tag === "ALL" || tag === "GLOBAL" || tag === "ANY";
}

/**
 * Soft market gate (JS mirror of knowledge_market_ok).
 * Keeps untagged / global rows; drops explicit wrong-market docs.
 * Used as post-filter if RPC migration not applied yet, and for text fallback.
 */
export function softFilterHitsByMarket(
  hits: RagKnowledgeHit[],
  market: VehicleMarketCode | string | undefined,
): RagKnowledgeHit[] {
  const target = normalizeVehicleMarket(market).toUpperCase();
  const region = getRegion(target).toUpperCase();

  const kept = hits.filter((hit) => {
    const tag = hitMarketTag(hit);
    if (isUniversalMarketTag(tag)) return true;
    return tag === target || tag === region;
  });

  // Never return empty solely because of market — fall back to untagged-first ranking
  if (kept.length > 0) return kept;

  const untagged = hits.filter((hit) => isUniversalMarketTag(hitMarketTag(hit)));
  return untagged.length > 0 ? untagged : hits;
}

/** Prefer exact market matches when scoring text fallback. */
function marketScoreBonus(
  hit: RagKnowledgeHit,
  market: VehicleMarketCode | string | undefined,
): number {
  const tag = hitMarketTag(hit);
  const target = normalizeVehicleMarket(market).toUpperCase();
  if (isUniversalMarketTag(tag)) return 1;
  if (tag === target || tag === getRegion(target).toUpperCase()) return 4;
  return -2;
}

function normalizeHit(row: Record<string, unknown>): RagKnowledgeHit {
  return {
    id: typeof row.id === "string" ? row.id : undefined,
    title: typeof row.title === "string" ? row.title : "",
    content: typeof row.content === "string" ? row.content : "",
    source: typeof row.source === "string" ? row.source : undefined,
    category: typeof row.category === "string" ? row.category : undefined,
    vehicle_make:
      typeof row.vehicle_make === "string" ? row.vehicle_make : undefined,
    vehicle_model:
      typeof row.vehicle_model === "string" ? row.vehicle_model : undefined,
    vehicle_years:
      typeof row.vehicle_years === "string" ? row.vehicle_years : undefined,
    metadata:
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : {},
    similarity:
      typeof row.similarity === "number"
        ? row.similarity
        : typeof row.similarity === "string"
          ? Number(row.similarity)
          : undefined,
  };
}

function mapRpcHits(data: unknown): RagKnowledgeHit[] {
  if (!Array.isArray(data)) return [];
  return (data as Record<string, unknown>[]).map(normalizeHit);
}

/** Last-resort JS keyword ranking when RPCs are unavailable */
async function textFallbackSearch(
  query: string,
  vehicle: VehicleFilter,
  limit: number,
): Promise<RagKnowledgeHit[]> {
  const client = getClient();
  const tokens = query
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2)
    .slice(0, 8);

  const { data, error } = await client
    .from("knowledge_base")
    .select(
      "id, title, content, source, category, vehicle_make, vehicle_model, vehicle_years, metadata",
    )
    .eq("is_active", true)
    .limit(80);

  if (error || !data) {
    console.warn("[rag] text fallback failed:", error?.message);
    return [];
  }

  const make = vehicle.make.toLowerCase();
  const model = vehicle.model.toLowerCase();

  return softFilterHitsByMarket(
    (data as Record<string, unknown>[])
      .map(normalizeHit)
      .map((hit) => {
        const hay = `${hit.title} ${hit.content}`.toLowerCase();
        let score = 0;
        if (hit.vehicle_make?.toLowerCase() === make) score += 3;
        if (hit.vehicle_model?.toLowerCase() === model) score += 3;
        if (!hit.vehicle_make && !hit.vehicle_model) score += 1;
        score += marketScoreBonus(hit, vehicle.market);
        for (const token of tokens) {
          if (hay.includes(token)) score += 1;
        }
        return { hit, score };
      })
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(limit * 2, limit))
      .map((row) => row.hit),
    vehicle.market,
  ).slice(0, limit);
}

async function searchFts(
  query: string,
  vehicle: VehicleFilter,
  limit: number,
): Promise<RagKnowledgeHit[] | null> {
  const client = getClient();
  const { data, error } = await client.rpc("match_knowledge_fts", {
    query_text: query,
    match_count: limit,
    filter: vehicleFilterPayload(vehicle),
  });

  if (error) {
    console.warn("[rag] match_knowledge_fts:", error.message);
    return null;
  }
  return mapRpcHits(data);
}

async function searchHybrid(
  query: string,
  embedding: number[] | null,
  vehicle: VehicleFilter,
  limit: number,
): Promise<RagKnowledgeHit[] | null> {
  const client = getClient();
  const { data, error } = await client.rpc("match_knowledge_hybrid", {
    query_text: query,
    query_embedding: embedding,
    match_count: limit,
    filter: vehicleFilterPayload(vehicle),
    rrf_k: 60,
  });

  if (error) {
    console.warn("[rag] match_knowledge_hybrid:", error.message);
    return null;
  }
  return mapRpcHits(data);
}

async function searchVectorOnly(
  embedding: number[],
  vehicle: VehicleFilter,
  limit: number,
): Promise<RagKnowledgeHit[] | null> {
  const client = getClient();
  const { data, error } = await client.rpc("match_documents", {
    query_embedding: embedding,
    match_count: limit,
    filter: vehicleFilterPayload(vehicle),
  });

  if (error) {
    console.warn("[rag] match_documents:", error.message);
    return null;
  }
  return mapRpcHits(data);
}

/** Try embedding providers; return null instead of throwing when unavailable */
export async function tryGenerateEmbedding(
  text: string,
): Promise<number[] | null> {
  try {
    return await ragService.generateEmbedding(text);
  } catch (err) {
    console.warn("[rag] embedding skipped:", err);
    return null;
  }
}

/**
 * Embeddings for knowledge_base.embedding (vector 1536).
 * Skip if provider returns a different dimension (FTS still works).
 */
export async function tryGenerateKnowledgeEmbedding(
  text: string,
): Promise<number[] | null> {
  const emb = await tryGenerateEmbedding(text);
  if (!emb) return null;
  if (emb.length !== 1536) {
    console.warn(
      `[rag] skip knowledge embed: got dim ${emb.length}, need 1536`,
    );
    return null;
  }
  return emb;
}

export const ragService = {
  async generateEmbedding(text: string): Promise<number[]> {
    const input = text.slice(0, 8000);

    if (!DEEPSEEK_API_KEY) {
      throw new Error(
        "Embedding provider unavailable: configure DEEPSEEK_API_KEY (FTS still works).",
      );
    }

    if (Date.now() < deepseekEmbeddingDisabledUntil) {
      throw new Error(
        "DeepSeek embeddings temporarily disabled after prior failure (using FTS).",
      );
    }

    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      DEEPSEEK_EMBEDDING_TIMEOUT_MS,
    );

    try {
      const response = await fetch(DEEPSEEK_EMBEDDING_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: DEEPSEEK_EMBEDDING_MODEL,
          input,
        }),
      });

      if (response.ok) {
        const data = (await response.json()) as {
          data: Array<{ embedding: number[] }>;
        };
        const embedding = data.data[0]?.embedding;
        if (embedding?.length) return embedding;
        throw new Error("DeepSeek embedding response missing vector");
      }

      const body = await response.text().catch(() => "");
      console.warn("[rag] DeepSeek embedding HTTP", response.status, body);
      // 404 / 4xx: model or endpoint unavailable — cool down so chat stays fast
      if (response.status >= 400) {
        deepseekEmbeddingDisabledUntil = Date.now() + 30 * 60_000;
      }
      throw new Error(`DeepSeek embedding HTTP ${response.status}`);
    } catch (err) {
      if (
        err &&
        typeof err === "object" &&
        "name" in err &&
        (err as { name?: string }).name === "AbortError"
      ) {
        deepseekEmbeddingDisabledUntil = Date.now() + 10 * 60_000;
        throw new Error(
          `DeepSeek embedding timed out after ${DEEPSEEK_EMBEDDING_TIMEOUT_MS}ms`,
        );
      }
      throw err instanceof Error ? err : new Error(String(err));
    } finally {
      clearTimeout(timer);
    }
  },

  /**
   * Retrieve relevant knowledge for a user query + vehicle.
   * Prefers hybrid RRF when embeddings exist; otherwise FTS-only.
   * Never throws to chat callers — returns [] on total failure.
   */
  async retrieveRelevantKnowledge(
    query: string,
    vehicle: VehicleFilter,
    limit = 5,
    options?: { diySkill?: string | null; mileage?: number | null },
  ): Promise<RagKnowledgeHit[]> {
    const safeLimit = Math.max(1, Math.min(limit, 12));
    const trimmed = query.trim();
    if (!trimmed) return [];

    const market = normalizeVehicleMarket(vehicle.market);
    const enrichedQuery = `${vehicle.year} ${vehicle.make} ${vehicle.model} ${market} ${trimmed}`;

    const finalize = (hits: RagKnowledgeHit[]) =>
      prioritizeRagHits(
        softFilterHitsByMarket(
          filterEnglishKnowledgeHits(hits, "rag.retrieveRelevantKnowledge"),
          market,
        ),
        {
          diySkill: options?.diySkill,
          make: vehicle.make,
          model: vehicle.model,
          year: vehicle.year,
          mileage: options?.mileage ?? null,
        },
      );

    try {
      // Optional embedding — absence is fine for Phase A (FTS)
      const embedding = await tryGenerateEmbedding(enrichedQuery);

      // Prefer hybrid RPC (FTS + vector RRF; vector side no-ops if embedding null)
      const hybrid = await searchHybrid(
        enrichedQuery,
        embedding,
        vehicle,
        safeLimit,
      );
      if (hybrid && hybrid.length > 0) return finalize(hybrid);

      // FTS-only RPC
      const fts = await searchFts(enrichedQuery, vehicle, safeLimit);
      if (fts && fts.length > 0) return finalize(fts);

      // Retry FTS with raw user text (shorter, often better for plainto_tsquery)
      if (enrichedQuery !== trimmed) {
        const ftsRaw = await searchFts(trimmed, vehicle, safeLimit);
        if (ftsRaw && ftsRaw.length > 0) return finalize(ftsRaw);
      }

      // Legacy vector-only path if embedding worked but hybrid RPC missing
      if (embedding) {
        const vec = await searchVectorOnly(embedding, vehicle, safeLimit);
        if (vec && vec.length > 0) return finalize(vec);
      }

      return finalize(await textFallbackSearch(trimmed, vehicle, safeLimit));
    } catch (err) {
      console.warn("[rag] retrieveRelevantKnowledge:", err);
      try {
        return finalize(await textFallbackSearch(trimmed, vehicle, safeLimit));
      } catch {
        return [];
      }
    }
  },

  /**
   * Format hits for the chat system prompt.
   * Priority inside the prompt: configuration > repair steps > parts.
   */
  formatKnowledgeForPrompt(
    hits: RagKnowledgeHit[],
    options?: {
      market?: string;
      maxChars?: number;
      diySkill?: string | null;
      make?: string | null;
      model?: string | null;
      year?: number | null;
      mileage?: number | null;
    },
  ) {
    return formatKnowledgeForPrompt(hits, options?.maxChars ?? 6500, {
      market: options?.market,
      diySkill: options?.diySkill,
      make: options?.make,
      model: options?.model,
      year: options?.year,
      mileage: options?.mileage,
    });
  },
};
