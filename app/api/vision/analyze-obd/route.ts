import { NextRequest } from "next/server";
import {
  estimateTokensFromMessages,
  normalizeImageUrl,
  type DeepSeekMessage,
} from "@/lib/deepseek";
import { callVisionJson } from "@/lib/vision";
import { normalizeVehicleMarket } from "@/lib/types/vehicle-market";
import type { ObdVisionAnalysis } from "@/lib/types/dtc";
import { extractDtcCodes, lookupDtc } from "@/lib/dtc";
import {
  AI_ROUTE_TOKEN_FLOOR,
  aiAbuseResponse,
  assertAiRateLimit,
  assertAiTokenBudget,
  consumeAiTokensBestEffort,
  requireVerifiedAiUser,
} from "@/lib/ai-abuse";
import { aiUpstreamResponse } from "@/lib/ai-errors";

export const runtime = "nodejs";

function extractJsonObject(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence?.[1]) {
      return JSON.parse(fence[1].trim()) as Record<string, unknown>;
    }
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1)) as Record<
        string,
        unknown
      >;
    }
    throw new Error("Model did not return valid JSON");
  }
}

function normalizeObdAnalysis(raw: Record<string, unknown>): ObdVisionAnalysis {
  const codesRaw = Array.isArray(raw.codes) ? raw.codes : [];
  const fromModel = codesRaw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const code = String(row.code || "").trim().toUpperCase();
      if (!/^([PCBU])[0-9A-F]{4}$/.test(code)) return null;
      const hit = lookupDtc(code);
      return {
        code: hit.code,
        desc: String(row.desc || row.description || hit.desc).trim() || hit.desc,
        severity: String(row.severity || hit.severity),
      };
    })
    .filter(Boolean) as ObdVisionAnalysis["codes"];

  // Also scrape any free-text fields for codes the model listed outside JSON array
  const blob = [
    typeof raw.notes === "string" ? raw.notes : "",
    typeof raw.raw_text_glimpse === "string" ? raw.raw_text_glimpse : "",
    JSON.stringify(raw.codes ?? []),
  ].join(" ");
  const scraped = extractDtcCodes(blob).map((c) => {
    const hit = lookupDtc(c);
    return { code: hit.code, desc: hit.desc, severity: hit.severity };
  });

  const byCode = new Map<string, ObdVisionAnalysis["codes"][number]>();
  for (const c of [...fromModel, ...scraped]) byCode.set(c.code, c);

  return {
    codes: [...byCode.values()],
    warning_lights: Array.isArray(raw.warning_lights)
      ? raw.warning_lights.map(String)
      : [],
    tool_brand:
      typeof raw.tool_brand === "string" ? raw.tool_brand : null,
    notes: typeof raw.notes === "string" ? raw.notes : null,
    raw_text_glimpse:
      typeof raw.raw_text_glimpse === "string" ? raw.raw_text_glimpse : null,
  };
}

/**
 * POST /api/vision/analyze-obd
 *
 * Extract DTCs from an OBD scanner screenshot or dash warning photo.
 * Auth: Bearer <supabase access_token>
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireVerifiedAiUser(req);
    await assertAiRateLimit(user.id, "vision", user.email);

    const body = await req.json();
    const imageRaw =
      (typeof body.image === "string" && body.image) ||
      (typeof body.imageBase64 === "string" && body.imageBase64) ||
      "";
    const vehicle = body.vehicle as
      | {
          year?: number;
          make?: string;
          model?: string;
          market?: string;
          engine?: string;
        }
      | undefined;

    if (!imageRaw.trim()) {
      return Response.json({ error: "Missing image" }, { status: 400 });
    }

    const market = normalizeVehicleMarket(vehicle?.market);
    const ymm = [vehicle?.year, vehicle?.make, vehicle?.model]
      .filter(Boolean)
      .join(" ");

    const visionPrompt = `You are reading an OBD-II scan tool screenshot, Bluetooth OBD app screen, or dashboard/check-engine warning photo.
Vehicle context (may be incomplete): ${ymm || "unknown"}${
      vehicle?.engine ? ` · ${vehicle.engine}` : ""
    } (${market}).

Extract ONLY diagnostic trouble codes that are clearly visible (P0xxx / C0xxx / B0xxx / U0xxx style).

Return ONLY valid JSON:
{
  "codes": [{"code": "P0420", "desc": "short OEM-style description if shown", "severity": "Moderate|Low|High|Info"}],
  "warning_lights": ["Check Engine"],
  "tool_brand": "brand if visible else null",
  "raw_text_glimpse": "short OCR of the code list area",
  "notes": "one short sentence for DIY owner"
}

Rules:
- Do NOT invent codes. If none are readable, return "codes": [].
- Prefer exact characters on screen (hex digits OK).
- Ignore freeze-frame numbers that are not DTCs.
- Multiple codes: include all clearly listed.`;

    const messages: DeepSeekMessage[] = [
      {
        role: "system",
        content:
          "You are Garage Genius OBD Vision. Output valid JSON only. Never invent DTCs you cannot read.",
      },
      {
        role: "user",
        content: [
          { type: "text", text: visionPrompt },
          {
            type: "image_url",
            image_url: { url: normalizeImageUrl(imageRaw) },
          },
        ],
      },
    ];

    const estimated = Math.max(
      AI_ROUTE_TOKEN_FLOOR.vision,
      estimateTokensFromMessages(messages),
    );
    await assertAiTokenBudget(user.id, estimated, user.email);

    const { content, usage, model, visionProvider } = await callVisionJson(
      messages,
      700,
    );
    await consumeAiTokensBestEffort(
      user.id,
      Math.max(1, usage.total_tokens),
      {
        route: "vision",
        model,
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        email: user.email,
        metadata: { visionProvider, kind: "obd" },
      },
      "[/api/vision/analyze-obd]",
    );

    const parsed = normalizeObdAnalysis(extractJsonObject(content));

    return Response.json({
      success: true,
      data: parsed,
      ...parsed,
      market,
      usage: {
        prompt_tokens: usage.prompt_tokens,
        completion_tokens: usage.completion_tokens,
        total_tokens: usage.total_tokens,
      },
    });
  } catch (error) {
    const abuse = aiAbuseResponse(error);
    if (abuse) return abuse;

    const upstream = aiUpstreamResponse(error);
    if (upstream) return upstream;

    console.error("[/api/vision/analyze-obd] unexpected", {
      message: error instanceof Error ? error.message : String(error),
    });
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "OBD screenshot analysis failed",
        code: "AI_UNAVAILABLE",
        retryable: true,
      },
      { status: 500 },
    );
  }
}
