import { NextRequest } from "next/server";
import {
  callDeepSeekVisionJson,
  estimateTokensFromMessages,
  normalizeImageUrl,
  type DeepSeekMessage,
} from "@/lib/deepseek";
import { normalizeVehicleMarket } from "@/lib/types/vehicle-market";
import type { VisionVehicleAnalysis } from "@/lib/supabase-vehicle-vitals";
import {
  AI_ROUTE_TOKEN_FLOOR,
  aiAbuseResponse,
  assertAiRateLimit,
  assertAiTokenBudget,
  consumeAiTokens,
  requireAiUser,
} from "@/lib/ai-abuse";

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

function normalizeAnalysis(
  raw: Record<string, unknown>,
): VisionVehicleAnalysis {
  const fluidsRaw = raw.fluids;
  const fluids =
    fluidsRaw && typeof fluidsRaw === "object" && !Array.isArray(fluidsRaw)
      ? Object.fromEntries(
          Object.entries(fluidsRaw as Record<string, unknown>).map(
            ([k, v]) => [k, String(v ?? "")],
          ),
        )
      : {};

  const codesRaw = Array.isArray(raw.codes) ? raw.codes : [];
  const codes = codesRaw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const code = String(row.code || "").trim();
      if (!code) return null;
      return {
        code,
        desc: String(row.desc || row.description || "").trim(),
        severity: String(row.severity || "Info"),
      };
    })
    .filter(Boolean) as VisionVehicleAnalysis["codes"];

  const score =
    typeof raw.health_score === "number"
      ? raw.health_score
      : typeof raw.health_score === "string"
        ? Number(raw.health_score)
        : null;

  let notes = typeof raw.notes === "string" ? raw.notes : null;
  const tx = fluids.transmissionFluid || fluids.transmission_fluid;
  if (tx && String(tx).toLowerCase() !== "unknown") {
    const line = `Transmission fluid: ${tx}`;
    notes = notes ? `${notes} · ${line}` : line;
  }

  return {
    fluids,
    tire_pressure:
      typeof raw.tire_pressure === "string" ? raw.tire_pressure : null,
    codes,
    health_score:
      score != null && !Number.isNaN(score)
        ? Math.max(0, Math.min(100, Math.round(score)))
        : null,
    notes,
    warning_lights: Array.isArray(raw.warning_lights)
      ? raw.warning_lights.map(String)
      : [],
  };
}

/**
 * POST /api/vision/analyze-vehicle
 *
 * Body (either image field works):
 *   { image | imageBase64: dataUrl, vehicle: { year, make, model, market, engine? } }
 *
 * Auth: Authorization: Bearer <supabase access_token>
 * (Server routes cannot use anon createClient().auth.getUser() without the user JWT.)
 *
 * Response:
 *   { success: true, data: VisionVehicleAnalysis, market, usage }
 *   + flat fields duplicated for Dashboard writeback compatibility
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAiUser(req);
    await assertAiRateLimit(user.id, "vision");

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

    if (!imageRaw.trim() || !vehicle) {
      return Response.json(
        { error: "Missing image or vehicle data" },
        { status: 400 },
      );
    }
    if (!vehicle.make || !vehicle.model) {
      return Response.json(
        { error: "vehicle.make and vehicle.model are required" },
        { status: 400 },
      );
    }

    const market = normalizeVehicleMarket(vehicle.market);
    const ymm = [vehicle.year, vehicle.make, vehicle.model]
      .filter(Boolean)
      .join(" ");

    const visionPrompt = `Analyze this car dashboard / fluid / warning light photo.
Vehicle: ${ymm}${vehicle.engine ? ` · ${vehicle.engine}` : ""} (${market} market version).
Respect ${market}-spec labeling (AKI vs RON, mi vs km) when guessing fluid status.

Return ONLY valid JSON (no extra text):
{
  "fluids": {
    "engineOil": "Good|Normal|Low|Critical|Unknown",
    "coolant": "Good|Normal|Low|Critical|Unknown",
    "brakeFluid": "Good|Normal|Low|Critical|Unknown",
    "transmissionFluid": "Good|Normal|Low|Critical|Unknown",
    "tirePressure": "e.g. 34 PSI (All) or Unknown"
  },
  "tire_pressure": "34 PSI (All good) or specific values, or null if not visible",
  "codes": [{"code": "P0171", "desc": "System Too Lean", "severity": "Moderate|Low|High|Info"}],
  "warning_lights": ["Check Engine"],
  "health_score": 88,
  "notes": "Short DIY diagnosis summary with repair suggestions"
}

Rules:
- If something is not visible, use "Unknown" / empty codes — do NOT invent DTCs.
- Only include codes clearly readable on a scan tool display or dash message.
- health_score 0-100 based on visible issues (warnings lower the score).
- Prefer conservative DIY advice in notes.`;

    const messages: DeepSeekMessage[] = [
      {
        role: "system",
        content:
          "You are Garage Genius Vision. Output valid JSON only matching the schema. Be conservative; never invent OEM codes you cannot see.",
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
    await assertAiTokenBudget(user.id, estimated);

    // Uses deepseek-vl → deepseek-chat Vision path (not a fictional "deepseek-vision" id)
    const { content, usage } = await callDeepSeekVisionJson(messages, 900);
    await consumeAiTokens(user.id, Math.max(1, usage.total_tokens), {
      route: "vision",
      model: "deepseek-vl",
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
    });

    const parsed = normalizeAnalysis(extractJsonObject(content));

    return Response.json({
      success: true,
      data: parsed,
      // Flat copy for existing Dashboard writeback
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

    console.error("[/api/vision/analyze-vehicle]", error);
    return Response.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Vision analysis failed",
      },
      { status: 500 },
    );
  }
}
