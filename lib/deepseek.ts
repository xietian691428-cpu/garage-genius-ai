/**
 * DeepSeek API 客户端 — 仅限服务端使用
 * 通过 app/api/chat/route.ts 调用，切勿在 Client Component 中 import
 */

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

/** 文字消息内容 */
export type TextContentPart = { type: "text"; text: string };

/** 图片消息内容（base64 data URL 或 http URL） */
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

const VISION_MODELS = ["deepseek-vl", "deepseek-chat"] as const;
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
        // Vision payloads are large; count a fixed overhead instead of raw base64
        if (part.type === "image_url") chars += 2000;
      }
    }
  }
  const promptEstimate = Math.ceil(chars / 4);
  return promptEstimate + expectedCompletion;
}

/** 确保 base64 图片为 data URL 格式 */
export function normalizeImageUrl(image: string): string {
  if (image.startsWith("data:") || image.startsWith("http")) {
    return image;
  }
  return `data:image/jpeg;base64,${image}`;
}

/**
 * Vision 失败时降级为纯文字
 * 告知模型用户附带了照片，请基于描述给出诊断并追问细节
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

async function requestDeepSeek(
  messages: DeepSeekMessage[],
  model: string,
  options?: { json?: boolean; maxTokens?: number },
): Promise<DeepSeekResult> {
  if (!DEEPSEEK_API_KEY) {
    throw new Error("DEEPSEEK_API_KEY is not configured");
  }

  const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      max_tokens: options?.maxTokens ?? 1200,
      ...(options?.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`DeepSeek API Error: ${response.status} ${errorBody}`);
  }

  const data = await response.json();
  return {
    content: data.choices[0].message.content as string,
    usage: parseUsage(data),
  };
}

/**
 * 调用 DeepSeek Chat API
 * 含图片时先尝试 Vision 模型，失败则自动降级为文字模式
 */
export async function callDeepSeek(
  messages: DeepSeekMessage[],
): Promise<DeepSeekResult> {
  const hasImage = messageHasImage(messages);

  if (!hasImage) {
    return requestDeepSeek(messages, TEXT_MODEL);
  }

  // 依次尝试 Vision 兼容模型
  for (const model of VISION_MODELS) {
    try {
      return await requestDeepSeek(messages, model);
    } catch (error) {
      console.warn(`[deepseek] Vision model "${model}" failed:`, error);
    }
  }

  // 全部失败 → 文字 fallback
  console.warn("[deepseek] Falling back to text-only mode for image message");
  return requestDeepSeek(fallbackToTextMessages(messages), TEXT_MODEL);
}

/** 结构化 JSON 输出（Dashboard 等区域诊断） */
export async function callDeepSeekJson(
  messages: DeepSeekMessage[],
  maxTokens = 2000,
): Promise<DeepSeekResult> {
  return requestDeepSeek(messages, TEXT_MODEL, { json: true, maxTokens });
}

/**
 * Vision + JSON（Dashboard 拍照解析液位 / 警告灯 / DTC）。
 * 先试 Vision 模型 + json_object；失败则文字降级仍要求 JSON。
 */
export async function callDeepSeekVisionJson(
  messages: DeepSeekMessage[],
  maxTokens = 1200,
): Promise<DeepSeekResult> {
  const hasImage = messageHasImage(messages);

  if (!hasImage) {
    return requestDeepSeek(messages, TEXT_MODEL, { json: true, maxTokens });
  }

  for (const model of VISION_MODELS) {
    try {
      return await requestDeepSeek(messages, model, {
        json: true,
        maxTokens,
      });
    } catch (error) {
      console.warn(`[deepseek] Vision JSON model "${model}" failed:`, error);
    }
  }

  console.warn("[deepseek] Vision JSON fallback to text-only");
  return requestDeepSeek(fallbackToTextMessages(messages), TEXT_MODEL, {
    json: true,
    maxTokens,
  });
}
