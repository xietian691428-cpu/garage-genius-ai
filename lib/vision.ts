/**
 * Vision orchestration: Kimi reads photos; DeepSeek handles text coaching / JSON fallback.
 */

import {
  callDeepSeek,
  callDeepSeekVisionJson,
  type DeepSeekMessage,
  type DeepSeekResult,
} from "@/lib/deepseek";
import {
  attachKimiVisionNoteToMessages,
  callKimiVisionDescribe,
  callKimiVisionJson,
  DEFAULT_VISION_MAX_TOKENS,
  isKimiConfigured,
} from "@/lib/kimi";

export type VisionPipelineResult = DeepSeekResult & {
  model: string;
  visionProvider: "kimi" | "deepseek" | "deepseek_text_fallback";
};

/**
 * Structured vision (dashboard / OBD / receipt) — prefer Kimi, fall back to DeepSeek VL.
 */
export async function callVisionJson(
  messages: DeepSeekMessage[],
  maxTokens = 1200,
): Promise<VisionPipelineResult> {
  if (isKimiConfigured()) {
    try {
      // kimi-k3 uses reasoning tokens first; never starve completion budget.
      const kimiMax = Math.max(maxTokens, DEFAULT_VISION_MAX_TOKENS);
      const result = await callKimiVisionJson(messages, kimiMax);
      return {
        ...result,
        visionProvider: "kimi",
      };
    } catch (error) {
      console.warn("[vision] Kimi JSON failed, falling back to DeepSeek", error);
    }
  } else {
    console.warn("[vision] KIMI_API_KEY missing — using DeepSeek for photos");
  }

  const result = await callDeepSeekVisionJson(messages, maxTokens);
  return {
    ...result,
    model: "deepseek-vision",
    visionProvider: "deepseek",
  };
}

/**
 * Chat with photos: Kimi describes images → DeepSeek coaches from text + note.
 * Text-only chat stays on DeepSeek.
 */
export async function callChatWithOptionalVision(
  messages: DeepSeekMessage[],
): Promise<VisionPipelineResult> {
  const hasImage = messages.some(
    (m) =>
      Array.isArray(m.content) &&
      m.content.some((part) => part.type === "image_url"),
  );

  if (!hasImage) {
    const result = await callDeepSeek(messages);
    return {
      ...result,
      model: "deepseek-chat",
      visionProvider: "deepseek",
    };
  }

  if (isKimiConfigured()) {
    try {
      const vision = await callKimiVisionDescribe(messages);
      const enriched = attachKimiVisionNoteToMessages(messages, vision.content);
      const coach = await callDeepSeek(enriched);
      return {
        content: coach.content,
        usage: {
          prompt_tokens:
            (vision.usage.prompt_tokens ?? 0) + (coach.usage.prompt_tokens ?? 0),
          completion_tokens:
            (vision.usage.completion_tokens ?? 0) +
            (coach.usage.completion_tokens ?? 0),
          total_tokens:
            (vision.usage.total_tokens ?? 0) + (coach.usage.total_tokens ?? 0),
        },
        model: `${vision.model}+deepseek-chat`,
        visionProvider: "kimi",
      };
    } catch (error) {
      console.warn(
        "[vision] Kimi describe failed, falling back to DeepSeek multimodal",
        error,
      );
    }
  }

  const result = await callDeepSeek(messages);
  return {
    ...result,
    model: "deepseek-chat",
    visionProvider: "deepseek_text_fallback",
  };
}
