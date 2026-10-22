/**
 * Chat photo → structured JSON perception.
 * Default: DeepSeek VL first, Kimi (Moonshot) fallback — unified with chat coaching.
 * Override with VISION_PRIMARY=kimi. Never throws. Never logs image bytes.
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
import { getVisionPrimary } from "@/lib/vision/primary";
import { parseImageAnalysis } from "@/lib/vision/parse-analysis";
import type { ImageAnalysis } from "@/lib/vision/types";

/** Shared perception system prompt (DeepSeek VL + Kimi). */
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

export const VISION_PERCEPTION_SYSTEM = KIMI_PERCEPTION_SYSTEM;

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
  | "deepseek_disabled"
  | "deepseek_fail"
  | "deepseek_unparsed"
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
  /** True only when no vision provider can run. */
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
    { role: "system", content: VISION_PERCEPTION_SYSTEM },
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

type AttemptOk = {
  ok: true;
  analysis: ImageAnalysis;
  model: string;
  usage: AnalyzeChatImageResult["usage"];
};

type AttemptFail = {
  ok: false;
  reason: Exclude<ChatVisionFallbackFrom, null>;
};

async function tryDeepSeek(
  messages: DeepSeekMessage[],
  requestId: string,
  started: number,
  asFallbackFrom: ChatVisionFallbackFrom,
): Promise<AttemptOk | AttemptFail> {
  if (!isDeepSeekConfigured()) {
    visionLog("deepseek.skip", {
      requestId,
      reason: "no_deepseek_key",
      asFallbackFrom,
    });
    return { ok: false, reason: "deepseek_disabled" };
  }

  visionLog(asFallbackFrom ? "deepseek.fallback_start" : "deepseek.start", {
    requestId,
    from: asFallbackFrom,
  });
  try {
    const result = await callDeepSeekVisionJson(messages, 700, {
      allowTextFallback: false,
    });
    const analysis = parseImageAnalysis(result.content);
    const elapsedMs = Date.now() - started;
    if (!analysis) {
      visionLog("deepseek.unparsed", {
        requestId,
        elapsedMs,
        model: result.model,
        from: asFallbackFrom,
      });
      return { ok: false, reason: "deepseek_unparsed" };
    }
    visionLog(asFallbackFrom ? "deepseek.fallback_ok" : "deepseek.ok", {
      requestId,
      model: result.model,
      elapsedMs,
      confidence: analysis.confidence,
      condition: analysis.condition,
      scene: analysis.scene,
      dtcCount: analysis.dtc_codes.length,
      from: asFallbackFrom,
    });
    return {
      ok: true,
      analysis,
      model: result.model || "deepseek-vision",
      usage: result.usage,
    };
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code?: string }).code)
        : "unknown";
    visionLog("deepseek.fail", {
      requestId,
      elapsedMs: Date.now() - started,
      code,
      from: asFallbackFrom,
    });
    return { ok: false, reason: "deepseek_fail" };
  }
}

async function tryKimi(
  messages: DeepSeekMessage[],
  requestId: string,
  started: number,
  asFallbackFrom: ChatVisionFallbackFrom,
): Promise<AttemptOk | AttemptFail> {
  if (!isKimiVisionEnabled()) {
    visionLog("kimi.skip", {
      requestId,
      reason: "disabled_or_no_key",
      asFallbackFrom,
    });
    return { ok: false, reason: "kimi_disabled" };
  }

  visionLog(asFallbackFrom ? "kimi.fallback_start" : "kimi.start", {
    requestId,
    from: asFallbackFrom,
  });
  try {
    const result = await callKimiVisionJson(messages, 700, {
      timeoutMs: kimiVisionTimeoutMs(),
      maxRetries: 0,
    });
    const analysis = parseImageAnalysis(result.content);
    const elapsedMs = Date.now() - started;
    if (!analysis) {
      visionLog("kimi.unparsed", {
        requestId,
        elapsedMs,
        model: result.model,
        from: asFallbackFrom,
      });
      return { ok: false, reason: "kimi_unparsed" };
    }
    visionLog(asFallbackFrom ? "kimi.fallback_ok" : "kimi.ok", {
      requestId,
      model: result.model,
      elapsedMs,
      confidence: analysis.confidence,
      condition: analysis.condition,
      scene: analysis.scene,
      dtcCount: analysis.dtc_codes.length,
      from: asFallbackFrom,
    });
    return {
      ok: true,
      analysis,
      model: result.model || kimiVisionModels()[0] || "kimi-k3",
      usage: result.usage,
    };
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code?: string }).code)
        : "unknown";
    visionLog("kimi.fail", {
      requestId,
      elapsedMs: Date.now() - started,
      code,
      from: asFallbackFrom,
    });
    return { ok: false, reason: "kimi_fail" };
  }
}

function toResult(
  requestId: string,
  started: number,
  provider: ChatVisionProvider,
  hit: AttemptOk,
  fallbackFrom: ChatVisionFallbackFrom,
): AnalyzeChatImageResult {
  return {
    analysis: hit.analysis,
    model: hit.model,
    elapsedMs: Date.now() - started,
    requestId,
    failed: false,
    disabled: false,
    billed: true,
    provider,
    fallbackFrom,
    usage: hit.usage,
  };
}

/**
 * One-photo structured analysis.
 * Default order: DeepSeek VL → Kimi. Never throws.
 */
export async function analyzeChatImage(
  imageDataUrl: string,
  userText: string,
): Promise<AnalyzeChatImageResult> {
  const requestId = crypto.randomUUID().slice(0, 8);
  const started = Date.now();
  const messages = perceptionMessages(imageDataUrl, userText);
  const primary = getVisionPrimary();

  visionLog("perception.start", { requestId, primary });

  const order: ChatVisionProvider[] =
    primary === "kimi" ? ["kimi", "deepseek"] : ["deepseek", "kimi"];

  let fallbackFrom: ChatVisionFallbackFrom = null;

  for (let i = 0; i < order.length; i++) {
    const provider = order[i];
    const asFallback = i === 0 ? null : fallbackFrom;
    const attempt =
      provider === "deepseek"
        ? await tryDeepSeek(messages, requestId, started, asFallback)
        : await tryKimi(messages, requestId, started, asFallback);

    if (attempt.ok) {
      return toResult(
        requestId,
        started,
        provider,
        attempt,
        i === 0 ? null : fallbackFrom,
      );
    }
    fallbackFrom = attempt.reason;
  }

  const bothUnavailable = !isDeepSeekConfigured() && !isKimiVisionEnabled();
  visionLog("perception.unavailable", {
    requestId,
    elapsedMs: Date.now() - started,
    primary,
    from: fallbackFrom,
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
    fallbackFrom,
    usage: null,
  };
}
