/**
 * Chat photo → Kimi structured JSON (perception only).
 * HTTP lives in lib/kimi.ts; this module owns the schema prompt + parse + logs.
 */

import type { DeepSeekMessage } from "@/lib/deepseek";
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
  "scene": "obd_screen" | "engine" | "gauge" | "fluid_level" | "part_closeup" | "underbody" | "tire" | "other",
  "ocr_text": ["visible text snippets"],
  "dtc_codes": ["P0420"],
  "readings": [{ "name": "oil_level", "value": "between_min_max", "unit": null }],
  "objects": ["dipstick"],
  "safety_flags": ["vehicle_raised" | "hot_surface" | "none"],
  "notes": "short factual notes only"
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

Rules:
- confidence is 0–1. If blurry, dark, or unreadable, set condition accordingly, set confidence below 0.5, leave ocr_text/dtc_codes/readings empty, and say the photo must be retaken.
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

export type AnalyzeChatImageResult = {
  analysis: ImageAnalysis | null;
  model: string;
  elapsedMs: number;
  requestId: string;
  failed: boolean;
  disabled: boolean;
  billed: boolean;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  } | null;
};

/**
 * One-photo Kimi JSON analysis. Never throws. Never logs image bytes.
 */
export async function analyzeChatImage(
  imageDataUrl: string,
  userText: string,
): Promise<AnalyzeChatImageResult> {
  const requestId = crypto.randomUUID().slice(0, 8);
  const started = Date.now();

  if (!isKimiVisionEnabled()) {
    visionLog("kimi.skip", { requestId, reason: "disabled_or_no_key" });
    return {
      analysis: null,
      model: "",
      elapsedMs: Date.now() - started,
      requestId,
      failed: false,
      disabled: true,
      billed: false,
      usage: null,
    };
  }

  const messages: DeepSeekMessage[] = [
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
    return {
      analysis,
      model: result.model || kimiVisionModels()[0] || "kimi-k3",
      elapsedMs,
      requestId,
      failed: !analysis,
      disabled: false,
      billed: true,
      usage: result.usage,
    };
  } catch (err) {
    const elapsedMs = Date.now() - started;
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code?: string }).code)
        : "unknown";
    visionLog("kimi.fail", { requestId, elapsedMs, code });
    return {
      analysis: null,
      model: "",
      elapsedMs,
      requestId,
      failed: true,
      disabled: false,
      billed: false,
      usage: null,
    };
  }
}
