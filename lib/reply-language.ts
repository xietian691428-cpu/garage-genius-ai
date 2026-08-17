/**
 * AI reply language follows the user's latest message — not Settings UI locale.
 * RAG / product UI stay on their existing language policies.
 */

import {
  LEGAL_DISCLAIMER_EN,
  LEGAL_DISCLAIMER_ES,
  LEGAL_DISCLAIMER_ZH,
} from "@/lib/legal-disclaimer";

const CJK_RE = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/;

/** Injected into Chat system prompts every turn. */
export const REPLY_LANGUAGE_PROMPT = `
## Reply language (required)
- Respond in the **same language as the user's latest message**. Match their language and register (formal/casual).
- UI language settings do **not** force the reply language.
- Chinese question → Chinese answer. English → English. Español → Español. Other languages → follow the user when you can; if unsure, use clear English.
- Same conversation may switch languages mid-thread — always follow the **latest** user message.
- Machine markers stay English tokens: <focus>engine</focus> (or brakes | suspension | battery | tires | hvac | ac | transmission | lights).
- Inside <focus-data>, keep "part" / type as English ids; "message", "steps", "tools", and "safetyNotes" MUST be in the **same language as the reply**.
- Write the closing liability disclaimer in the **same language as the reply** (full, clear wording — not English-only unless the reply is English).
- Safety / soft-language rules still apply in every language: no guaranteed fix, no single definite root cause, no insurance coverage assertions, prefer "possible cause" / "recommended check" / "may indicate".
- Do not invent OEM part numbers. Prefer retrieved English knowledge; paraphrase into the reply language when needed — never paste raw non-matching-language RAG dumps.
`.trim();

export type ReplyLanguageHint = "zh" | "es" | "en";

const HINT_LABEL: Record<ReplyLanguageHint, string> = {
  zh: "Chinese (简体中文)",
  es: "Spanish (Español)",
  en: "English",
};

/**
 * Lightweight script / keyword hint for disclaimer fallback + hard turn lock.
 * Soft REPLY_LANGUAGE_PROMPT alone is not enough after a mid-thread language switch.
 */
export function detectReplyLanguageHint(
  text: string | null | undefined,
): ReplyLanguageHint {
  const raw = (text || "").trim();
  if (!raw) return "en";

  const cjk = raw.match(new RegExp(CJK_RE.source, "g"))?.length ?? 0;
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
 */
export function turnReplyLanguageLock(
  hint: ReplyLanguageHint,
): string {
  const label = HINT_LABEL[hint];
  const must =
    hint === "zh"
      ? "Write the **entire** reply in Chinese (简体中文) — including problem summary, steps, tips, cost notes, encouragement, Focus Mode user-visible strings, and the closing liability disclaimer."
      : hint === "es"
        ? "Write the **entire** reply in Spanish (Español) — including summary, steps, tips, Focus Mode user-visible strings, and the closing liability disclaimer."
        : "Write the **entire** reply in English — including summary, steps, tips, Focus Mode user-visible strings, and the closing liability disclaimer.";

  return `
## THIS TURN — HARD LANGUAGE LOCK (required)
- Detected language of the user's **latest** message: **${label}**.
- ${must}
- Do **not** continue in another language even if earlier messages in this thread used a different language.
- Machine markers stay English tokens only: <focus>…</focus> and focus-data "part" ids.
`.trim();
}

export function disclaimerForReplyLanguage(
  hint: ReplyLanguageHint,
): string {
  if (hint === "zh") return LEGAL_DISCLAIMER_ZH;
  if (hint === "es") return LEGAL_DISCLAIMER_ES;
  return LEGAL_DISCLAIMER_EN;
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
