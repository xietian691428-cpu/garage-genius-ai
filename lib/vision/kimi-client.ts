/**
 * Chat photo → structured JSON perception (Kimi first, DeepSeek VL fallback).
 * HTTP for Kimi lives in lib/kimi.ts; DeepSeek VL in lib/deepseek.ts.
 * This module owns the schema prompt + parse + logs. Never throws.
 */

import {
  callDeepSeekVisionJson,
  isDeepSeekConfigured,
  type DeepSeekMessage,
} from "@/lib/deepseek";
import {
  callKimiVisionJson,
  isKimiVisionEnabled,
  kimiVisionTimeoutMs,
  kimiVisionModels,
} from "@/lib/kimi";
import { parseImageAnalysis } from "@/lib/vision/parse-analysis";
import type { ImageAnalysis } from "@/lib/vision/types";

export const KIMI_PERCEPTION_SYSTEM = `You are a perception-only automotive image analyst for Garage Genius (US DIY).
Output a single JSON object. No markdown, no repair plan, no coaching steps, no torque specs, no part numbers unless the text is printed in the photo.

JSON schema:
{
  "condition": "clear" | "blurry" | "dark" | "partial" | "unreadable",
  "confidence": 0.0,
  "scene": "obd_screen" | "engine" | "gauge" | "fluid_level" | "part_closeup" | "underbody" | "tire" | "headlight_housing" | "other",
  "ocr_text": ["visible text snippets"],
  "dtc_codes": ["P0420"],
  "readings": [{ "name": "oil_level", "value": "between_min_max", "unit": null }],
  "objects": ["dipstick"],
  "safety_flags": ["vehicle_raised" | "hot_surface" | "none"],
  "notes": "short factual notes only",
  "housing_guess": "dust_cap" | "sealed_heatsink" | "unclear",
  "housing_confidence": "high" | "low"
}

US scene examples (copy the shape; only fill what is actually visible):

1) Clear OBD / scan-tool screenshot:
{"condition":"clear","confidence":0.9,"scene":"obd_screen","ocr_text":["P0420","MIL ON"],"dtc_codes":["P0420"],"readings":[],"objects":["scan tool"],"safety_flags":["none"],"notes":"Scan tool screen shows P0420."}

2) Blurry OBD (force retake — empty codes/readings):
{"condition":"blurry","confidence":0.2,"scene":"obd_screen","ocr_text":[],"dtc_codes":[],"readings":[],"objects":["phone screen"],"safety_flags":["none"],"notes":"Code digits are unreadable."}

3) Engine oil dipstick:
{"condition":"clear","confidence":0.82,"scene":"fluid_level","ocr_text":["MIN","MAX"],"dtc_codes":[],"readings":[{"name":"oil_level","value":"between_min_max","unit":null}],"objects":["dipstick"],"safety_flags":["none"],"notes":"Oil film sits between MIN and MAX marks."}

4) Tire sidewall:
{"condition":"clear","confidence":0.78,"scene":"tire","ocr_text":["P215/55R17"],"dtc_codes":[],"readings":[{"name":"tire_size","value":"P215/55R17","unit":null}],"objects":["tire sidewall"],"safety_flags":["none"],"notes":"Sidewall size P215/55R17 is readable."}

Headlight housing (rear of lamp / under-hood back of headlamp) — optional assist only:
- Use scene "headlight_housing" when the photo shows the back of a headlamp / dust cover / LED heatsink.
- housing_guess=dust_cap only if a twist-off round dust cover / bulb access is clearly visible.
- housing_guess=sealed_heatsink only if a sealed module / metal heat-sink fins with no plug-in bulb is clearly visible.
- Otherwise housing_guess=unclear and housing_confidence=low.
- housing_confidence=high ONLY when the structure is unambiguous and the photo is clear (not dark/blurry).
- NEVER invent a bulb size (H11, 9005, etc.), OEM part number, or claim the photo proves a bulb type.

Rules:
- confidence is 0–1. If blurry, dark, or unreadable, set condition accordingly, set confidence below 0.5, leave ocr_text/dtc_codes/readings empty, set housing_guess=unclear and housing_confidence=low, and say the photo must be retaken.
- Never guess a DTC, oil quarts, PSI, DOT date, or load index that is not clearly printed.
- dtc_codes must be OBD-II style (P/C/B/U + 4 hex digits) copied from the photo when visible.
- safety_flags: vehicle_raised if the car appears jacked/lifted; hot_surface if steam/glowing metal is visible.
- ocr_text: at most 8 short snippets. notes: one sentence, max 200 characters.
- Output the JSON object only. No markdown fences.
- Never prescribe a repair or name a root cause.`;

function visionLog(
  event: string,
  meta: Record<string, unknown>,
): void {
  const safe = { ...meta };
  for (const [k, v] of Object.entries(safe)) {
    if (typeof v === "string" && /data:image|base64,/i.test(v)) {
      safe[k] = "[redacted-image]";
    }
  }
  console.info("[vision]", event, safe);
}

export type ChatVisionProvider = "kimi" | "deepseek";

export type ChatVisionFallbackFrom =
  | "kimi_disabled"
  | "kimi_fail"
  | "kimi_unparsed"
  | null;

export type AnalyzeChatImageResult = {
  analysis: ImageAnalysis | null;
  model: string;
  elapsedMs: number;
  requestId: string;
  failed: boolean;
  /** True only when no vision provider can run (no Kimi and no DeepSeek key). */
  disabled: boolean;
  billed: boolean;
  provider: ChatVisionProvider | null;
  fallbackFrom: ChatVisionFallbackFrom;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  } | null;
};

function perceptionMessages(
  imageDataUrl: string,
  userText: string,
): DeepSeekMessage[] {
  return [
    { role: "system", content: KIMI_PERCEPTION_SYSTEM },
    {
      role: "user",
      content: [
        {
          type: "text",
          text:
            userText.trim() ||
            "Analyze this vehicle photo. Return the JSON schema only.",
        },
        {
          type: "image_url",
          image_url: { url: imageDataUrl },
        },
      ],
    },
  ];
}

async function tryDeepSeekPerception(
  messages: DeepSeekMessage[],
  requestId: string,
  fallbackFrom: Exclude<ChatVisionFallbackFrom, null>,
  started: number,
): Promise<AnalyzeChatImageResult | null> {
  if (!isDeepSeekConfigured()) {
    visionLog("deepseek.fallback_skip", {
      requestId,
      reason: "no_deepseek_key",
      from: fallbackFrom,
    });
    return null;
  }

  visionLog("deepseek.fallback_start", { requestId, from: fallbackFrom });
  try {
    const result = await callDeepSeekVisionJson(messages, 700, {
      allowTextFallback: false,
    });
    const analysis = parseImageAnalysis(result.content);
    const elapsedMs = Date.now() - started;
    if (!analysis) {
      visionLog("deepseek.fallback_unparsed", {
        requestId,
        elapsedMs,
        model: result.model,
        from: fallbackFrom,
      });
      return null;
    }
    visionLog("deepseek.fallback_ok", {
      requestId,
      model: result.model,
      elapsedMs,
      confidence: analysis.confidence,
      condition: analysis.condition,
      scene: analysis.scene,
      dtcCount: analysis.dtc_codes.length,
      from: fallbackFrom,
    });
    return {
      analysis,
      model: result.model || "deepseek-vision",
      elapsedMs,
      requestId,
      failed: false,
      disabled: false,
      billed: true,
      provider: "deepseek",
      fallbackFrom,
      usage: result.usage,
    };
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code?: string }).code)
        : "unknown";
    visionLog("deepseek.fallback_fail", {
      requestId,
      elapsedMs: Date.now() - started,
      code,
      from: fallbackFrom,
    });
    return null;
  }
}

/**
 * One-photo structured analysis. Kimi first; DeepSeek VL if Kimi is off/fails.
 * Never throws. Never logs image bytes.
 */
export async function analyzeChatImage(
  imageDataUrl: string,
  userText: string,
): Promise<AnalyzeChatImageResult> {
  const requestId = crypto.randomUUID().slice(0, 8);
  const started = Date.now();
  const messages = perceptionMessages(imageDataUrl, userText);

  let fallbackFrom: Exclude<ChatVisionFallbackFrom, null> | null = null;

  if (!isKimiVisionEnabled()) {
    visionLog("kimi.skip", { requestId, reason: "disabled_or_no_key" });
    fallbackFrom = "kimi_disabled";
  } else {
    try {
      const result = await callKimiVisionJson(messages, 700, {
        timeoutMs: kimiVisionTimeoutMs(),
        maxRetries: 0,
      });
      const analysis = parseImageAnalysis(result.content);
      const elapsedMs = Date.now() - started;
      visionLog("kimi.ok", {
        requestId,
        model: result.model,
        elapsedMs,
        confidence: analysis?.confidence ?? null,
        condition: analysis?.condition ?? null,
        scene: analysis?.scene ?? null,
        dtcCount: analysis?.dtc_codes.length ?? 0,
        parsed: Boolean(analysis),
      });
      if (analysis) {
        return {
          analysis,
          model: result.model || kimiVisionModels()[0] || "kimi-k3",
          elapsedMs,
          requestId,
          failed: false,
          disabled: false,
          billed: true,
          provider: "kimi",
          fallbackFrom: null,
          usage: result.usage,
        };
      }
      fallbackFrom = "kimi_unparsed";
    } catch (err) {
      const elapsedMs = Date.now() - started;
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code?: string }).code)
          : "unknown";
      visionLog("kimi.fail", { requestId, elapsedMs, code });
      fallbackFrom = "kimi_fail";
    }
  }

  const from = fallbackFrom ?? "kimi_fail";
  const ds = await tryDeepSeekPerception(messages, requestId, from, started);
  if (ds) return ds;

  const bothUnavailable = !isKimiVisionEnabled() && !isDeepSeekConfigured();
  visionLog("perception.unavailable", {
    requestId,
    elapsedMs: Date.now() - started,
    from,
    bothUnavailable,
  });

  return {
    analysis: null,
    model: "",
    elapsedMs: Date.now() - started,
    requestId,
    failed: !bothUnavailable,
    disabled: bothUnavailable,
    billed: false,
    provider: null,
    fallbackFrom: from,
    usage: null,
  };
}
