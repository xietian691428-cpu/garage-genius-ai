/**
 * Hard block for Chinese / CJK knowledge in the English (en-US) product path.
 * Not configurable for chat / Focus injection — Chinese corpus stays offline for training only.
 */

import type { RagKnowledgeHit } from "@/lib/types/rag";

const CJK_CHAR_RE = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/;

const ZH_CORPORA = new Set([
  "car_repair_qa",
  "carrepairqa",
  "car_fault_zh",
  "car_fault",
]);

export type CjkBlockReason =
  | "metadata.language"
  | "corpus.car_repair_qa"
  | "title.cjk"
  | "body.cjk"
  | "focus.field";

export function containsCjkText(value?: string | null): boolean {
  if (!value) return false;
  return CJK_CHAR_RE.test(value);
}

function cjkCharCount(text: string): number {
  return text.match(new RegExp(CJK_CHAR_RE.source, "g"))?.length ?? 0;
}

/** Log CJK leakage attempts (hit id + path) for ops review. */
export function logCjkRagLeakage(opts: {
  path: string;
  reason: CjkBlockReason | string;
  hitId?: string | null;
  title?: string | null;
  corpus?: string | null;
  language?: string | null;
}): void {
  const id = opts.hitId?.slice?.(0, 12) || opts.hitId || "unknown";
  console.warn("[rag-language-guard] blocked CJK", {
    path: opts.path,
    reason: opts.reason,
    hitId: id,
    titlePreview: (opts.title || "").slice(0, 80),
    corpus: opts.corpus || null,
    language: opts.language || null,
  });
}

function hitLanguage(hit: RagKnowledgeHit): string {
  return String(hit.metadata?.language || "").toLowerCase().trim();
}

function hitCorpus(hit: RagKnowledgeHit): string {
  return String(hit.metadata?.corpus || "").toLowerCase().trim();
}

function hitSourceLabel(hit: RagKnowledgeHit): string {
  return String(hit.metadata?.source_label || "").toLowerCase().trim();
}

/**
 * True when a knowledge hit must never enter EN chat prompts or Focus.
 * Includes metadata.language=zh, CarRepairQA corpus, and obvious CJK body/title.
 */
export function isNonEnglishKnowledgeHit(hit: RagKnowledgeHit): boolean {
  const lang = hitLanguage(hit);
  if (lang === "zh" || lang.startsWith("zh-") || lang === "cn" || lang === "chinese") {
    return true;
  }

  const corpus = hitCorpus(hit);
  if (ZH_CORPORA.has(corpus) || corpus.includes("car_repair_qa")) {
    return true;
  }
  if (hitSourceLabel(hit).includes("carrepairqa")) {
    return true;
  }

  const title = hit.title || "";
  if (containsCjkText(title)) {
    return true;
  }

  const body = hit.content || "";
  const cjk = cjkCharCount(`${title}\n${body}`);
  if (cjk >= 8) return true;
  const letters = `${title}${body}`.replace(/\s/g, "").length || 1;
  return cjk / letters > 0.12;
}

/**
 * Drop Chinese / CJK hits. Always on for EN product — no opt-in to inject into sessions.
 */
export function filterEnglishKnowledgeHits(
  hits: RagKnowledgeHit[],
  path = "rag.filter",
): RagKnowledgeHit[] {
  const kept: RagKnowledgeHit[] = [];
  for (const hit of hits) {
    if (!isNonEnglishKnowledgeHit(hit)) {
      kept.push(hit);
      continue;
    }
    logCjkRagLeakage({
      path,
      reason: hitLanguage(hit).startsWith("zh")
        ? "metadata.language"
        : ZH_CORPORA.has(hitCorpus(hit)) ||
            hitCorpus(hit).includes("car_repair_qa")
          ? "corpus.car_repair_qa"
          : containsCjkText(hit.title)
            ? "title.cjk"
            : "body.cjk",
      hitId: hit.id,
      title: hit.title,
      corpus: hitCorpus(hit) || null,
      language: hitLanguage(hit) || null,
    });
  }
  return kept;
}

/**
 * Seed / ingest: never write embeddings for Chinese CarRepairQA in production.
 * Opt-in only via ALLOW_ZH_RAG_EMBEDDINGS=1 and never when NODE_ENV=production.
 */
export function shouldSkipZhKnowledgeEmbedding(item: {
  title?: string;
  content?: string;
  metadata?: Record<string, unknown>;
}): boolean {
  const lang = String(item.metadata?.language || "").toLowerCase();
  const corpus = String(item.metadata?.corpus || "").toLowerCase();
  const isZh =
    lang === "zh" ||
    lang.startsWith("zh-") ||
    ZH_CORPORA.has(corpus) ||
    corpus.includes("car_repair_qa") ||
    corpus.includes("car_fault") ||
    containsCjkText(item.title) ||
    cjkCharCount(item.content || "") >= 8;

  if (!isZh) return false;

  if (process.env.NODE_ENV === "production") {
    return true;
  }
  // Non-prod: still skip unless explicitly allowed (EN product default).
  return process.env.ALLOW_ZH_RAG_EMBEDDINGS !== "1";
}
