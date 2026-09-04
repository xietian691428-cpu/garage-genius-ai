/**
 * DeepSeek API client — server only (via app/api/* routes).
 * Includes timeout, limited retries, typed errors, and structured logging.
 */

import {
  DeepSeekRequestError,
  type AiUpstreamErrorCode,
} from "@/lib/ai-errors";

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

/** Default request timeout (ms) — under typical serverless maxDuration. */
export const DEEPSEEK_TIMEOUT_MS = 55_000;
/** Vision / JSON payloads can be slower. */
export const DEEPSEEK_VISION_TIMEOUT_MS = 50_000;
/** Extra retries after the first attempt (user: max 2). */
export const DEEPSEEK_MAX_RETRIES = 2;

/** Text message content */
export type TextContentPart = { type: "text"; text: string };

/** Image message content (base64 data URL or http URL) */
export type ImageContentPart = {
  type: "image_url";
  image_url: { url: string };
};

export type MessageContentPart = TextContentPart | ImageContentPart;

export type MessageContent = string | MessageContentPart[];

export interface DeepSeekMessage {
  role: "system" | "user" | "assistant";
  content: MessageContent;
}

export type DeepSeekUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
};

export type DeepSeekResult = {
  content: string;
  usage: DeepSeekUsage;
};

const VISION_MODELS = [
  "deepseek-v4-flash-vision-exp",
  "deepseek-v4-flash",
  "deepseek-chat",
] as const;
const TEXT_MODEL = "deepseek-chat";

function messageHasImage(messages: DeepSeekMessage[]): boolean {
  return messages.some(
    (m) =>
      Array.isArray(m.content) &&
      m.content.some((part) => part.type === "image_url"),
  );
}

/** Rough pre-flight estimate when API usage is not yet known (chars ≈ tokens/4). */
export function estimateTokensFromMessages(
  messages: DeepSeekMessage[],
  expectedCompletion = 1200,
): number {
  let chars = 0;
  for (const msg of messages) {
    if (typeof msg.content === "string") {
      chars += msg.content.length;
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === "text") chars += part.text.length;
        if (part.type === "image_url") chars += 2000;
      }
    }
  }
  const promptEstimate = Math.ceil(chars / 4);
  return promptEstimate + expectedCompletion;
}

/** Ensure base64 images are data URLs. */
export function normalizeImageUrl(image: string): string {
  if (image.startsWith("data:") || image.startsWith("http")) {
    return image;
  }
  return `data:image/jpeg;base64,${image}`;
}

const DEFAULT_CONTEXT_WINDOW = 24;
const IMAGE_HEAVY_CONTEXT_WINDOW = 16;
const DEFAULT_CONTENT_CHARS = 6_000;
const IMAGE_HEAVY_CONTENT_CHARS = 4_000;

function truncateTextContent(text: string, maxChars: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, maxChars)}\n…[truncated for length]`;
}

function messageText(m: DeepSeekMessage): string {
  if (typeof m.content === "string") return m.content;
  if (!Array.isArray(m.content)) return "";
  return m.content
    .filter((p): p is TextContentPart => p.type === "text")
    .map((p) => p.text)
    .join("\n");
}

/** Keep raised-vehicle / parking-brake / CRITICAL system lines when trimming. */
export function isProtectedSystemMessage(m: DeepSeekMessage): boolean {
  if (m.role !== "system") return false;
  return /CRITICAL STATE|vehicleRaised|parkingBrakeState|vehicle may already be raised/i.test(
    messageText(m),
  );
}

/**
 * Server-side defense: cap conversation window + per-message text so long
 * chats / multi-image turns are less likely to blow context or time out.
 * Keeps system messages; never truncates CRITICAL STATE / vehicleRaised /
 * parkingBrake lines; trims user/assistant text; preserves image parts.
 */
export function trimDeepSeekConversation(
  messages: DeepSeekMessage[],
  options?: { imageHeavy?: boolean; windowSize?: number; maxContentChars?: number },
): DeepSeekMessage[] {
  const imageHeavy =
    options?.imageHeavy ?? messageHasImage(messages);
  const windowSize =
    options?.windowSize ??
    (imageHeavy ? IMAGE_HEAVY_CONTEXT_WINDOW : DEFAULT_CONTEXT_WINDOW);
  const maxChars =
    options?.maxContentChars ??
    (imageHeavy ? IMAGE_HEAVY_CONTENT_CHARS : DEFAULT_CONTENT_CHARS);

  const system = messages.filter((m) => m.role === "system");
  const rest = messages.filter((m) => m.role !== "system");
  const sliced = rest.slice(-windowSize);

  const trimOne = (m: DeepSeekMessage): DeepSeekMessage => {
    if (isProtectedSystemMessage(m)) return m;
    if (typeof m.content === "string") {
      return { ...m, content: truncateTextContent(m.content, maxChars) };
    }
    if (!Array.isArray(m.content)) return m;
    return {
      ...m,
      content: m.content.map((part) =>
        part.type === "text"
          ? { ...part, text: truncateTextContent(part.text, maxChars) }
          : part,
      ),
    };
  };

  return [...system.map(trimOne), ...sliced.map(trimOne)];
}

/**
 * Vision failure → text-only, ask the model to continue from description.
 */
function fallbackToTextMessages(messages: DeepSeekMessage[]): DeepSeekMessage[] {
  return messages.map((message) => {
    if (!Array.isArray(message.content)) {
      return message;
    }

    const textPart = message.content.find(
      (part): part is TextContentPart => part.type === "text",
    );
    const hasImage = message.content.some((part) => part.type === "image_url");
    const userText =
      textPart?.text ||
      "Please analyze this photo and diagnose any issues for my vehicle.";

    if (!hasImage) {
      return { ...message, content: userText };
    }

    return {
      ...message,
      content: `${userText}

[User attached a vehicle photo. Automated image analysis is unavailable right now. Ask what they see in the photo — leaks, warning lights, worn parts, error codes — and give your best DIY diagnosis from their description.]`,
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
      message: `DeepSeek rate limited (429): ${body.slice(0, 200)}`,
    };
  }
  if (status === 402 || /insufficient balance/i.test(body)) {
    return {
      code: "insufficient_balance",
      retryable: false,
      message: `DeepSeek insufficient balance (402): ${body.slice(0, 200)}`,
    };
  }
  if (status === 401 || status === 403) {
    return {
      code: "auth",
      retryable: false,
      message: `DeepSeek auth error (${status}): ${body.slice(0, 200)}`,
    };
  }
  if (status >= 500) {
    return {
      code: "server_error",
      retryable: true,
      message: `DeepSeek server error (${status}): ${body.slice(0, 200)}`,
    };
  }
  if (status === 400 || status === 413 || status === 422) {
    return {
      code: "bad_request",
      retryable: false,
      message: `DeepSeek bad request (${status}): ${body.slice(0, 200)}`,
    };
  }
  return {
    code: "unknown",
    retryable: status >= 500,
    message: `DeepSeek API Error: ${status} ${body.slice(0, 200)}`,
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
): Promise<DeepSeekResult> {
  if (!DEEPSEEK_API_KEY) {
    throw new DeepSeekRequestError("DEEPSEEK_API_KEY is not configured", {
      code: "config",
      retryable: false,
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const response = await fetch(
      "https://api.deepseek.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.7,
          max_tokens: options.maxTokens ?? 1200,
          ...(options.json ? { response_format: { type: "json_object" } } : {}),
        }),
      },
    );

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
      throw new DeepSeekRequestError("DeepSeek returned empty content", {
        code: "empty",
        status: response.status,
        retryable: true,
        attempt: options.attempt,
      });
    }

    return {
      content,
      usage: parseUsage(data),
    };
  } catch (err) {
    if (err instanceof DeepSeekRequestError) throw err;

    const name =
      err && typeof err === "object" && "name" in err
        ? String((err as { name?: string }).name)
        : "";
    if (name === "AbortError" || /aborted|timeout/i.test(String(err))) {
      throw new DeepSeekRequestError(
        `DeepSeek request timed out after ${options.timeoutMs}ms`,
        {
          code: "timeout",
          retryable: true,
          attempt: options.attempt,
          cause: err,
        },
      );
    }

    throw new DeepSeekRequestError(
      err instanceof Error ? err.message : "DeepSeek network error",
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

async function requestDeepSeek(
  messages: DeepSeekMessage[],
  model: string,
  options?: {
    json?: boolean;
    maxTokens?: number;
    timeoutMs?: number;
    maxRetries?: number;
  },
): Promise<DeepSeekResult> {
  const timeoutMs = options?.timeoutMs ?? DEEPSEEK_TIMEOUT_MS;
  const maxRetries = options?.maxRetries ?? DEEPSEEK_MAX_RETRIES;
  let lastError: DeepSeekRequestError | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const backoff = 400 * attempt + Math.floor(Math.random() * 200);
        console.warn("[deepseek] retry", {
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
        console.info("[deepseek] succeeded after retry", { model, attempt });
      }
      return result;
    } catch (err) {
      const typed =
        err instanceof DeepSeekRequestError
          ? err
          : new DeepSeekRequestError(
              err instanceof Error ? err.message : "Unknown DeepSeek error",
              { code: "unknown", retryable: false, attempt, cause: err },
            );
      lastError = typed;
      console.error("[deepseek] attempt failed", {
        model,
        attempt,
        code: typed.code,
        status: typed.status,
        message: typed.message,
        retryable: typed.retryable,
      });

      if (!typed.retryable || attempt >= maxRetries) {
        throw typed;
      }
    }
  }

  throw (
    lastError ??
    new DeepSeekRequestError("DeepSeek request failed", {
      code: "unknown",
      retryable: false,
    })
  );
}

/**
 * Chat completions. With images: try Vision models, then text fallback.
 */
export async function callDeepSeek(
  messages: DeepSeekMessage[],
): Promise<DeepSeekResult> {
  const hasImage = messageHasImage(messages);

  if (!hasImage) {
    return requestDeepSeek(messages, TEXT_MODEL);
  }

  for (const model of VISION_MODELS) {
    try {
      return await requestDeepSeek(messages, model, {
        timeoutMs: DEEPSEEK_VISION_TIMEOUT_MS,
      });
    } catch (error) {
      console.warn(`[deepseek] Vision model "${model}" failed:`, error);
    }
  }

  console.warn("[deepseek] Falling back to text-only mode for image message");
  return requestDeepSeek(fallbackToTextMessages(messages), TEXT_MODEL);
}

/** Structured JSON (Dashboard region inspect). */
export async function callDeepSeekJson(
  messages: DeepSeekMessage[],
  maxTokens = 2000,
): Promise<DeepSeekResult> {
  return requestDeepSeek(messages, TEXT_MODEL, { json: true, maxTokens });
}

/**
 * Vision + JSON (dashboard / OBD screenshot).
 * Tries Vision models + json_object; falls back to text JSON.
 */
export async function callDeepSeekVisionJson(
  messages: DeepSeekMessage[],
  maxTokens = 1200,
): Promise<DeepSeekResult> {
  const hasImage = messageHasImage(messages);

  if (!hasImage) {
    return requestDeepSeek(messages, TEXT_MODEL, {
      json: true,
      maxTokens,
      timeoutMs: DEEPSEEK_VISION_TIMEOUT_MS,
    });
  }

  for (const model of VISION_MODELS) {
    try {
      return await requestDeepSeek(messages, model, {
        json: true,
        maxTokens,
        timeoutMs: DEEPSEEK_VISION_TIMEOUT_MS,
      });
    } catch (error) {
      console.warn(`[deepseek] Vision JSON model "${model}" failed:`, error);
    }
  }

  console.warn("[deepseek] Vision JSON fallback to text-only");
  return requestDeepSeek(fallbackToTextMessages(messages), TEXT_MODEL, {
    json: true,
    maxTokens,
    timeoutMs: DEEPSEEK_VISION_TIMEOUT_MS,
  });
}
