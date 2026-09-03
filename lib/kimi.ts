/**
 * Kimi (Moonshot) vision client — server only.
 * Photos / screenshots use Kimi; DeepSeek remains the text coach.
 */

import {
  DeepSeekRequestError,
  type AiUpstreamErrorCode,
} from "@/lib/ai-errors";
import type {
  DeepSeekMessage,
  DeepSeekResult,
  DeepSeekUsage,
  TextContentPart,
} from "@/lib/deepseek";
import { normalizeImageUrl } from "@/lib/deepseek";

const KIMI_API_KEY =
  process.env.KIMI_API_KEY?.trim() ||
  process.env.MOONSHOT_API_KEY?.trim() ||
  "";

/** International platform default; override with KIMI_BASE_URL for moonshot.cn. */
export const KIMI_BASE_URL = (
  process.env.KIMI_BASE_URL?.trim() || "https://api.moonshot.ai/v1"
).replace(/\/$/, "");

export const KIMI_VISION_TIMEOUT_MS = 55_000;
export const KIMI_MAX_RETRIES = 2;

/** Prefer current multimodal models; fall back for older Moonshot accounts. */
export const KIMI_VISION_MODELS = [
  process.env.KIMI_VISION_MODEL?.trim() || "kimi-k3",
  "kimi-k2.5",
  "moonshot-v1-32k-vision-preview",
  "moonshot-v1-8k-vision-preview",
].filter((m, i, arr) => m && arr.indexOf(m) === i);

export function isKimiConfigured(): boolean {
  return Boolean(KIMI_API_KEY);
}

function messageHasImage(messages: DeepSeekMessage[]): boolean {
  return messages.some(
    (m) =>
      Array.isArray(m.content) &&
      m.content.some((part) => part.type === "image_url"),
  );
}

/** Ensure image parts use data: URLs (Kimi rejects bare http image URLs). */
export function normalizeKimiMessages(
  messages: DeepSeekMessage[],
): DeepSeekMessage[] {
  return messages.map((m) => {
    if (!Array.isArray(m.content)) return m;
    return {
      ...m,
      content: m.content.map((part) =>
        part.type === "image_url"
          ? {
              type: "image_url" as const,
              image_url: { url: normalizeImageUrl(part.image_url.url) },
            }
          : part,
      ),
    };
  });
}

function parseUsage(data: {
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}): DeepSeekUsage {
  const prompt = data.usage?.prompt_tokens ?? 0;
  const completion = data.usage?.completion_tokens ?? 0;
  const total = data.usage?.total_tokens ?? prompt + completion;
  return {
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: total > 0 ? total : 1,
  };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function classifyHttpError(
  status: number,
  body: string,
): { code: AiUpstreamErrorCode; retryable: boolean; message: string } {
  if (status === 429) {
    return {
      code: "rate_limit",
      retryable: true,
      message: `Kimi rate limited (429): ${body.slice(0, 200)}`,
    };
  }
  if (status === 402 || /insufficient|balance|quota/i.test(body)) {
    return {
      code: "insufficient_balance",
      retryable: false,
      message: `Kimi insufficient balance (${status}): ${body.slice(0, 200)}`,
    };
  }
  if (status === 401 || status === 403) {
    return {
      code: "auth",
      retryable: false,
      message: `Kimi auth error (${status}): ${body.slice(0, 200)}`,
    };
  }
  if (status >= 500) {
    return {
      code: "server_error",
      retryable: true,
      message: `Kimi server error (${status}): ${body.slice(0, 200)}`,
    };
  }
  if (status === 400 || status === 413 || status === 422) {
    return {
      code: "bad_request",
      retryable: false,
      message: `Kimi bad request (${status}): ${body.slice(0, 200)}`,
    };
  }
  return {
    code: "unknown",
    retryable: status >= 500,
    message: `Kimi API Error: ${status} ${body.slice(0, 200)}`,
  };
}

async function fetchOnce(
  messages: DeepSeekMessage[],
  model: string,
  options: {
    json?: boolean;
    maxTokens?: number;
    timeoutMs: number;
    attempt: number;
  },
): Promise<DeepSeekResult & { model: string }> {
  if (!KIMI_API_KEY) {
    throw new DeepSeekRequestError("KIMI_API_KEY is not configured", {
      code: "config",
      retryable: false,
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const response = await fetch(`${KIMI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${KIMI_API_KEY}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: normalizeKimiMessages(messages),
        temperature: 0.3,
        max_tokens: options.maxTokens ?? 1200,
        ...(options.json ? { response_format: { type: "json_object" } } : {}),
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      const classified = classifyHttpError(response.status, errorBody);
      throw new DeepSeekRequestError(classified.message, {
        code: classified.code,
        status: response.status,
        retryable: classified.retryable,
        attempt: options.attempt,
      });
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
      usage?: DeepSeekUsage;
    };
    const content = (data.choices?.[0]?.message?.content ?? "").trim();
    if (!content) {
      throw new DeepSeekRequestError("Kimi returned empty content", {
        code: "empty",
        status: response.status,
        retryable: true,
        attempt: options.attempt,
      });
    }

    return {
      content,
      usage: parseUsage(data),
      model,
    };
  } catch (err) {
    if (err instanceof DeepSeekRequestError) throw err;

    const name =
      err && typeof err === "object" && "name" in err
        ? String((err as { name?: string }).name)
        : "";
    if (name === "AbortError" || /aborted|timeout/i.test(String(err))) {
      throw new DeepSeekRequestError(
        `Kimi request timed out after ${options.timeoutMs}ms`,
        {
          code: "timeout",
          retryable: true,
          attempt: options.attempt,
          cause: err,
        },
      );
    }

    throw new DeepSeekRequestError(
      err instanceof Error ? err.message : "Kimi network error",
      {
        code: "network",
        retryable: true,
        attempt: options.attempt,
        cause: err,
      },
    );
  } finally {
    clearTimeout(timer);
  }
}

async function requestKimi(
  messages: DeepSeekMessage[],
  model: string,
  options?: {
    json?: boolean;
    maxTokens?: number;
    timeoutMs?: number;
    maxRetries?: number;
  },
): Promise<DeepSeekResult & { model: string }> {
  const timeoutMs = options?.timeoutMs ?? KIMI_VISION_TIMEOUT_MS;
  const maxRetries = options?.maxRetries ?? KIMI_MAX_RETRIES;
  let lastError: DeepSeekRequestError | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const backoff = 400 * attempt + Math.floor(Math.random() * 200);
        console.warn("[kimi] retry", {
          model,
          attempt,
          backoffMs: backoff,
          previous: lastError?.code,
        });
        await sleep(backoff);
      }

      const result = await fetchOnce(messages, model, {
        json: options?.json,
        maxTokens: options?.maxTokens,
        timeoutMs,
        attempt,
      });

      if (attempt > 0) {
        console.info("[kimi] succeeded after retry", { model, attempt });
      }
      return result;
    } catch (err) {
      const typed =
        err instanceof DeepSeekRequestError
          ? err
          : new DeepSeekRequestError(
              err instanceof Error ? err.message : "Unknown Kimi error",
              { code: "unknown", retryable: false, attempt, cause: err },
            );
      lastError = typed;
      console.error("[kimi] attempt failed", {
        model,
        attempt,
        code: typed.code,
        status: typed.status,
        message: typed.message,
        retryable: typed.retryable,
      });

      // Model not found → try next model without burning retries on the same id
      if (
        typed.code === "bad_request" &&
        /model|not found|invalid/i.test(typed.message)
      ) {
        throw typed;
      }

      if (!typed.retryable || attempt >= maxRetries) {
        throw typed;
      }
    }
  }

  throw (
    lastError ??
    new DeepSeekRequestError("Kimi request failed", {
      code: "unknown",
      retryable: false,
    })
  );
}

async function requestKimiWithModelFallback(
  messages: DeepSeekMessage[],
  options?: { json?: boolean; maxTokens?: number },
): Promise<DeepSeekResult & { model: string }> {
  let lastError: unknown = null;
  for (const model of KIMI_VISION_MODELS) {
    try {
      return await requestKimi(messages, model, {
        json: options?.json,
        maxTokens: options?.maxTokens,
        timeoutMs: KIMI_VISION_TIMEOUT_MS,
      });
    } catch (error) {
      lastError = error;
      console.warn(`[kimi] model "${model}" failed:`, error);
    }
  }
  throw (
    lastError ??
    new DeepSeekRequestError("Kimi vision failed for all models", {
      code: "unknown",
      retryable: false,
    })
  );
}

/**
 * Structured JSON from photos (vehicle / OBD / receipt).
 */
export async function callKimiVisionJson(
  messages: DeepSeekMessage[],
  maxTokens = 1200,
): Promise<DeepSeekResult & { model: string }> {
  if (!messageHasImage(messages)) {
    throw new DeepSeekRequestError(
      "Kimi vision JSON requires at least one image",
      { code: "bad_request", retryable: false },
    );
  }
  return requestKimiWithModelFallback(messages, { json: true, maxTokens });
}

/**
 * Free-form visual description for chat: Kimi reads photos, DeepSeek coaches.
 */
export async function callKimiVisionDescribe(
  messages: DeepSeekMessage[],
  maxTokens = 900,
): Promise<DeepSeekResult & { model: string }> {
  if (!messageHasImage(messages)) {
    throw new DeepSeekRequestError(
      "Kimi vision describe requires at least one image",
      { code: "bad_request", retryable: false },
    );
  }

  const describeMessages: DeepSeekMessage[] = [
    {
      role: "system",
      content:
        "You are a careful automotive photo analyst for DIY mechanics. Describe only what is visible: warning lights, fluid leaks, worn parts, damage, gauges, OBD/DTC text on screens, labels, and anything relevant to diagnosis. Be concrete and concise. Do not invent VIN or parts not visible.",
    },
    ...messages.filter((m) => m.role !== "system"),
  ];

  return requestKimiWithModelFallback(describeMessages, {
    json: false,
    maxTokens,
  });
}

/**
 * Replace image parts with a Kimi visual note so DeepSeek can coach from text.
 */
export function attachKimiVisionNoteToMessages(
  messages: DeepSeekMessage[],
  visionNote: string,
): DeepSeekMessage[] {
  const note = visionNote.trim();
  let attached = false;

  return messages.map((message) => {
    if (!Array.isArray(message.content)) return message;
    const hasImage = message.content.some((part) => part.type === "image_url");
    if (!hasImage) return message;

    const textPart = message.content.find(
      (part): part is TextContentPart => part.type === "text",
    );
    const userText = textPart?.text?.trim() || "Please diagnose from this photo.";

    if (attached || !note) {
      return { ...message, content: userText };
    }
    attached = true;
    return {
      ...message,
      content: `${userText}

[Photo analysis from Kimi vision]
${note}`,
    };
  });
}
