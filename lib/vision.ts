/**
 * Vision orchestration: DeepSeek VL (default) or Kimi reads photos as JSON;
 * DeepSeek text coaches from the analysis block. Chat never sends raw
 * vision-model prose as the user-facing reply.
 */

import {
  callDeepSeek,
  callDeepSeekVisionJson,
  isDeepSeekConfigured,
  type DeepSeekMessage,
  type DeepSeekResult,
} from "@/lib/deepseek";
import {
  attachImageAnalysisBlockToUserText,
  callKimiVisionJson,
  isKimiConfigured,
  isKimiVisionEnabled,
} from "@/lib/kimi";
import { analyzeChatImage } from "@/lib/vision/kimi-client";
import { getVisionPrimary } from "@/lib/vision/primary";
import {
  formatImageAnalysisBlock,
  formatPerceptionFailedBlock,
  formatRaisedVehicleImageSafety,
  toClientImageSummary,
} from "@/lib/vision/format-analysis";
import {
  analysisHasRaisedVehicle,
  CHAT_VISION_MAX_IMAGES,
  type ImageAnalysis,
  type ImageAnalysisClientSummary,
} from "@/lib/vision/types";

export type VisionPipelineResult = DeepSeekResult & {
  model: string;
  visionProvider: "kimi" | "deepseek" | "deepseek_text_fallback" | "unavailable";
  imageAnalysis?: ImageAnalysis | null;
  imageAnalysisSummary?: ImageAnalysisClientSummary | null;
  raisedVehicleFromImage?: boolean;
};

function errorCode(error: unknown): string {
  return error && typeof error === "object" && "code" in error
    ? String((error as { code?: string }).code)
    : "unknown";
}

/**
 * Structured vision (dashboard / OBD / receipt).
 * Default: DeepSeek VL → Kimi. VISION_PRIMARY=kimi reverses the order.
 */
export async function callVisionJson(
  messages: DeepSeekMessage[],
  maxTokens = 800,
): Promise<VisionPipelineResult> {
  const primary = getVisionPrimary();
  const tryDeepSeek = async (): Promise<VisionPipelineResult | null> => {
    if (!isDeepSeekConfigured()) return null;
    try {
      const result = await callDeepSeekVisionJson(messages, maxTokens, {
        allowTextFallback: false,
      });
      return {
        ...result,
        model: result.model || "deepseek-vision",
        visionProvider: "deepseek",
      };
    } catch (error) {
      console.warn("[vision] DeepSeek JSON failed", { code: errorCode(error) });
      return null;
    }
  };

  const tryKimi = async (): Promise<VisionPipelineResult | null> => {
    if (!(isKimiConfigured() && isKimiVisionEnabled())) return null;
    try {
      const result = await callKimiVisionJson(messages, maxTokens);
      return {
        ...result,
        visionProvider: "kimi",
      };
    } catch (error) {
      console.warn("[vision] Kimi JSON failed", { code: errorCode(error) });
      return null;
    }
  };

  const order =
    primary === "kimi"
      ? ([tryKimi, tryDeepSeek] as const)
      : ([tryDeepSeek, tryKimi] as const);

  for (const run of order) {
    const hit = await run();
    if (hit) return hit;
  }

  // Last resort: DeepSeek with text-only fallback (OBD/receipt must return something).
  const result = await callDeepSeekVisionJson(messages, maxTokens, {
    allowTextFallback: true,
  });
  return {
    ...result,
    model: result.model || "deepseek-vision",
    visionProvider: "deepseek",
  };
}

function stripImageParts(messages: DeepSeekMessage[]): DeepSeekMessage[] {
  return messages.map((message) => {
    if (!Array.isArray(message.content)) return message;
    const text = message.content
      .filter((p) => p.type === "text")
      .map((p) => (p.type === "text" ? p.text : ""))
      .join("\n")
      .trim();
    return { ...message, content: text || "Please diagnose from this photo." };
  });
}

/**
 * Chat with photos: structured perception (DeepSeek VL → Kimi) → DeepSeek text coach.
 * Perception is usually precomputed in /api/chat via analyzeChatImage.
 * If perception ultimately fails: DeepSeek coaches from text only (no 500).
 */
export async function callChatWithOptionalVision(
  messages: DeepSeekMessage[],
  options?: {
    /** Precomputed chat perception (preferred — one call in the route). */
    analysis?: ImageAnalysis | null;
    analysisModel?: string;
    analysisProvider?: "kimi" | "deepseek";
    perceptionFailed?: boolean;
    perceptionDisabled?: boolean;
  },
): Promise<VisionPipelineResult> {
  const hasImage = messages.some(
    (m) =>
      Array.isArray(m.content) &&
      m.content.some((part) => part.type === "image_url"),
  );

  if (!hasImage && !options?.analysis && !options?.perceptionFailed && !options?.perceptionDisabled) {
    const result = await callDeepSeek(messages);
    return {
      ...result,
      model: "deepseek-chat",
      visionProvider: "deepseek",
    };
  }

  let analysis = options?.analysis ?? null;
  let modelName = options?.analysisModel || "kimi-k3";
  let perceptionProvider: "kimi" | "deepseek" | null =
    options?.analysisProvider ?? (analysis ? getVisionPrimary() : null);
  let failed = Boolean(options?.perceptionFailed);
  let disabled = Boolean(options?.perceptionDisabled);

  if (hasImage && analysis == null && !failed && !disabled) {
    try {
      const vision = await analyzeChatImage(
        firstImageUrl(messages) || "",
        latestUserText(messages),
      );
      analysis = vision.analysis;
      modelName = vision.model || modelName;
      perceptionProvider = vision.provider;
      failed = vision.failed;
      disabled = vision.disabled;
    } catch {
      failed = true;
    }
  }

  const block =
    analysis != null
      ? formatImageAnalysisBlock(analysis, modelName, latestUserText(messages))
      : formatPerceptionFailedBlock();

  let coachMessages = stripImageParts(messages);
  coachMessages = attachImageAnalysisBlockToUserText(coachMessages, block);
  if (analysis && analysisHasRaisedVehicle(analysis)) {
    coachMessages = [
      { role: "system", content: formatRaisedVehicleImageSafety() },
      ...coachMessages,
    ];
  }

  const coach = await callDeepSeek(coachMessages);
  const summary = analysis
    ? toClientImageSummary(analysis, perceptionProvider)
    : null;

  return {
    content: coach.content,
    usage: coach.usage,
    model: analysis
      ? `${modelName}+deepseek-chat`
      : "deepseek-chat",
    visionProvider: analysis
      ? perceptionProvider === "deepseek"
        ? "deepseek"
        : "kimi"
      : disabled
        ? "unavailable"
        : "deepseek_text_fallback",
    imageAnalysis: analysis,
    imageAnalysisSummary: summary,
    raisedVehicleFromImage: Boolean(analysis && analysisHasRaisedVehicle(analysis)),
  };
}

function latestUserText(messages: DeepSeekMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "user") continue;
    if (typeof m.content === "string") return m.content;
    if (Array.isArray(m.content)) {
      return m.content
        .filter((p) => p.type === "text")
        .map((p) => (p.type === "text" ? p.text : ""))
        .join("\n");
    }
  }
  return "";
}

function firstImageUrl(messages: DeepSeekMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!Array.isArray(m.content)) continue;
    const img = m.content.find((p) => p.type === "image_url");
    if (img && img.type === "image_url") return img.image_url.url;
  }
  return null;
}

export { CHAT_VISION_MAX_IMAGES };
