/**
 * Vision orchestration: Kimi reads photos as JSON; DeepSeek coaches from text.
 * Chat never sends Kimi's output as the user-facing reply.
 */

import {
  callDeepSeek,
  callDeepSeekVisionJson,
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

/**
 * Structured vision (dashboard / OBD / receipt) — prefer Kimi JSON.
 * Existing DeepSeek VL fallback stays for those routes only (not chat).
 */
export async function callVisionJson(
  messages: DeepSeekMessage[],
  maxTokens = 800,
): Promise<VisionPipelineResult> {
  if (isKimiConfigured() && isKimiVisionEnabled()) {
    try {
      const result = await callKimiVisionJson(messages, maxTokens);
      return {
        ...result,
        visionProvider: "kimi",
      };
    } catch (error) {
      console.warn("[vision] Kimi JSON failed, falling back to DeepSeek", {
        code:
          error && typeof error === "object" && "code" in error
            ? String((error as { code?: string }).code)
            : "unknown",
      });
    }
  }

  const result = await callDeepSeekVisionJson(messages, maxTokens);
  return {
    ...result,
    model: "deepseek-vision",
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
 * Chat with photos: Kimi structured perception → DeepSeek text coach.
 * On Kimi failure: DeepSeek still answers from text (no 500, no DeepSeek VL).
 */
export async function callChatWithOptionalVision(
  messages: DeepSeekMessage[],
  options?: {
    /** Precomputed chat perception (preferred — one Kimi call in the route). */
    analysis?: ImageAnalysis | null;
    analysisModel?: string;
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
  let failed = Boolean(options?.perceptionFailed);
  let disabled = Boolean(options?.perceptionDisabled);

  if (hasImage && analysis == null && !failed && !disabled && isKimiVisionEnabled()) {
    try {
      const vision = await analyzeChatImage(
        // analyzeChatImage expects a data URL; extract first image from messages
        firstImageUrl(messages) || "",
        latestUserText(messages),
      );
      analysis = vision.analysis;
      modelName = vision.model || modelName;
      failed = vision.failed;
      disabled = vision.disabled;
    } catch {
      failed = true;
    }
  } else if (hasImage && !isKimiVisionEnabled()) {
    disabled = true;
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
  const summary = analysis ? toClientImageSummary(analysis) : null;

  return {
    content: coach.content,
    usage: coach.usage,
    model: analysis
      ? `${modelName}+deepseek-chat`
      : "deepseek-chat",
    visionProvider: analysis
      ? "kimi"
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
