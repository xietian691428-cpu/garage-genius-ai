/**
 * AI reply language for US/EU product: assistant output is en or es only.
 * Never leave Chinese / CJK characters in user-visible assistant prose.
 * Detection of the user's message still recognizes zh for lock routing (forced → en).
 */

import {
  LEGAL_DISCLAIMER_EN,
  LEGAL_DISCLAIMER_ES,
} from "@/lib/legal-disclaimer";

/** Hiragana, katakana, CJK unified ideographs, CJK compatibility. */
export const CJK_CHAR_RE = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/;

/** Injected into Chat system prompts every turn. */
export const REPLY_LANGUAGE_PROMPT = `
## Reply language (required)
- This product serves US/EU owners. Assistant replies may be **English or Spanish (Español) only**.
- **Never use Chinese characters** (Simplified/Traditional Chinese or other CJK scripts) in any user-visible reply text — including summaries, steps, tips, Focus Mode strings, and the liability disclaimer.
- Match the user's latest message when it is English or Spanish. English → English. Español → Español.
- If the user writes Chinese or another unsupported language, reply in **clear English** (still no CJK).
- UI language settings do **not** force the reply language.
- Same conversation may switch mid-thread — always follow the **latest** user message within the en/es rule above.
- Machine markers stay English tokens: <focus>engine</focus> (or brakes | suspension | battery | tires | hvac | ac | transmission | lights).
- Inside <focus-data>, keep "part" / type as English ids; "message", "steps", "tools", and "safetyNotes" MUST be in the **same language as the reply** (en or es only — never CJK).
- Write the closing liability disclaimer in the **same language as the reply** (English or Spanish).
- Safety / soft-language rules still apply: no guaranteed fix, no single definite root cause, no insurance coverage assertions, prefer "possible cause" / "recommended check" / "may indicate".
- Do not invent OEM part numbers. Prefer retrieved English knowledge; paraphrase into the reply language when needed — never paste raw non-matching-language RAG dumps.
`.trim();

export type ReplyLanguageHint = "zh" | "es" | "en";

/** Languages the assistant is allowed to emit. */
export type ProductAssistantLanguage = "en" | "es";

const HINT_LABEL: Record<ReplyLanguageHint, string> = {
  zh: "Chinese (unsupported for replies — use English)",
  es: "Spanish (Español)",
  en: "English",
};

export const CJK_STRIP_FALLBACK_EN =
  "I need to answer in English for this product. Please rephrase your question in English (or Spanish), and I'll coach you step by step — including DIY oil changes, parking brake setup before jacking, and other driveway checks.";

export const CJK_STRIP_FALLBACK_ES =
  "Debo responder en español o inglés en este producto. Reformule su pregunta en español (o inglés) y le guiaré paso a paso.";

export function containsCjkChars(text: string | null | undefined): boolean {
  if (!text) return false;
  return CJK_CHAR_RE.test(text);
}

export function countCjkChars(text: string | null | undefined): number {
  if (!text) return 0;
  return text.match(new RegExp(CJK_CHAR_RE.source, "g"))?.length ?? 0;
}

/**
 * Map detected user-message hint → allowed assistant language.
 * Chinese (and anything else) → English.
 */
export function productAssistantLanguage(
  hint: ReplyLanguageHint,
): ProductAssistantLanguage {
  return hint === "es" ? "es" : "en";
}

/**
 * Lightweight script / keyword hint for disclaimer fallback + hard turn lock.
 * Soft REPLY_LANGUAGE_PROMPT alone is not enough after a mid-thread language switch.
 */
export function detectReplyLanguageHint(
  text: string | null | undefined,
): ReplyLanguageHint {
  const raw = (text || "").trim();
  if (!raw) return "en";

  const cjk = countCjkChars(raw);
  const compact = raw.replace(/\s/g, "");
  if (cjk >= 2 || (compact.length > 0 && cjk / compact.length >= 0.12)) {
    return "zh";
  }

  const lower = raw.toLowerCase();
  const esHits =
    (lower.match(
      /\b(el|la|los|las|de|que|qué|cómo|como|mi|mis|coche|carro|auto|frenos|motor|aceite|revisión|revisar|problema|ayuda)\b/gi,
    )?.length ?? 0) +
    (raw.match(/[áéíóúñü¿¡]/gi)?.length ?? 0);
  if (esHits >= 3) return "es";

  return "en";
}

/**
 * Hard per-turn lock injected after the main system prompt.
 * Prevents sticking to the previous turn's language when the user switches.
 * Chinese user messages lock to English — never instruct the model to reply in Chinese.
 */
export function turnReplyLanguageLock(
  hint: ReplyLanguageHint,
): string {
  const assistantLang = productAssistantLanguage(hint);
  const label = HINT_LABEL[hint];
  const must =
    assistantLang === "es"
      ? "Write the **entire** reply in Spanish (Español) — including summary, steps, tips, Focus Mode user-visible strings, and the closing liability disclaimer."
      : "Write the **entire** reply in English — including summary, steps, tips, Focus Mode user-visible strings, and the closing liability disclaimer.";

  const zhNote =
    hint === "zh"
      ? "\n- The user wrote in Chinese, but this product must **not** reply in Chinese. Use English only."
      : "";

  return `
## THIS TURN — HARD LANGUAGE LOCK (required)
- Detected language of the user's **latest** message: **${label}**.
- ${must}
- **Never use Chinese characters** (no Simplified/Traditional Chinese or other CJK scripts) anywhere in the user-visible reply.
- Do **not** continue in another language even if earlier messages in this thread used a different language.${zhNote}
- Machine markers stay English tokens only: <focus>…</focus> and focus-data "part" ids.
`.trim();
}

export function disclaimerForReplyLanguage(
  hint: ReplyLanguageHint,
): string {
  return productAssistantLanguage(hint) === "es"
    ? LEGAL_DISCLAIMER_ES
    : LEGAL_DISCLAIMER_EN;
}

/**
 * Drop sentences / lines that contain any CJK so mixed drafts never reach the user.
 * Preserves blank lines lightly; does not invent new coaching content.
 */
export function stripCjkSentences(text: string): string {
  const parts = text.split(/(\n+)/);
  const out: string[] = [];
  for (const part of parts) {
    if (/^\n+$/.test(part)) {
      out.push(part);
      continue;
    }
    if (!part.trim()) {
      out.push(part);
      continue;
    }
    // Split on sentence enders while keeping delimiters.
    const sentences = part.split(/(?<=[.!?。！？])\s+/);
    const kept = sentences.filter((s) => s.trim() && !containsCjkChars(s));
    if (kept.length) out.push(kept.join(" "));
  }
  return out
    .join("")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isAdequateAssistantProse(text: string): boolean {
  const compact = text.replace(/\s/g, "");
  if (compact.length < 40) return false;
  // Prefer Latin letters so we did not only keep punctuation / markers.
  const latin = text.match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g)?.length ?? 0;
  return latin >= 30;
}

/**
 * Deterministic post-gate: assistant visible text must have zero CJK.
 * Used after W1–W6 safety / tone / spec / OBD rewrites so those gates stay intact.
 */
export function enforceNoCjkAssistantReply(
  reply: string,
  hint: ReplyLanguageHint = "en",
): string {
  if (!containsCjkChars(reply)) return reply;

  const stripped = stripCjkSentences(reply);
  if (!containsCjkChars(stripped) && isAdequateAssistantProse(stripped)) {
    return stripped;
  }

  // Last resort: strip remaining CJK code points (may leave gaps) then fallback.
  const codePointStripped = stripped
    .replace(new RegExp(CJK_CHAR_RE.source, "g"), "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (
    !containsCjkChars(codePointStripped) &&
    isAdequateAssistantProse(codePointStripped)
  ) {
    return codePointStripped;
  }

  return productAssistantLanguage(hint) === "es"
    ? CJK_STRIP_FALLBACK_ES
    : CJK_STRIP_FALLBACK_EN;
}

/** System nudge for a single English (or Spanish) regeneration when CJK leaked. */
export function formatCjkRegenPrompt(
  target: ProductAssistantLanguage,
): string {
  if (target === "es") {
    return `
## LANGUAGE REPAIR (required — one rewrite)
The previous draft contained Chinese / CJK characters. That is forbidden.
Rewrite the **entire** assistant reply in Spanish (Español) only.
Never use Chinese characters. Keep the same safety intent and structure; do not invent new torque/spec numbers.
`.trim();
  }
  return `
## LANGUAGE REPAIR (required — one rewrite)
The previous draft contained Chinese / CJK characters. That is forbidden.
Rewrite the **entire** assistant reply in clear English only.
Never use Chinese characters. Keep the same safety intent and structure; do not invent new torque/spec numbers.
`.trim();
}

/** Extract plain text from a DeepSeek-style user message content. */
export function latestUserPlainText(
  messages: Array<{ role?: string; content?: unknown }> | null | undefined,
): string {
  if (!messages?.length) return "";
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg?.role !== "user") continue;
    const c = msg.content;
    if (typeof c === "string") return c;
    if (Array.isArray(c)) {
      const texts = c
        .map((part) => {
          if (!part || typeof part !== "object") return "";
          const p = part as { type?: string; text?: string };
          return p.type === "text" && typeof p.text === "string" ? p.text : "";
        })
        .filter(Boolean);
      if (texts.length) return texts.join("\n");
    }
  }
  return "";
}
