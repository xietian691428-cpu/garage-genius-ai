import { NextRequest } from "next/server";
import {
  estimateTokensFromMessages,
  normalizeImageUrl,
  type DeepSeekMessage,
} from "@/lib/deepseek";
import { callVisionJson } from "@/lib/vision";
import { normalizeVehicleMarket } from "@/lib/types/vehicle-market";
import type { ReceiptVisionAnalysis } from "@/lib/types/receipt";
import { normalizeMaintenanceCategory } from "@/lib/receipt-parse";
import { MAINTENANCE_CATEGORIES } from "@/lib/types/maintenance";
import {
  AI_ROUTE_TOKEN_FLOOR,
  aiAbuseResponse,
  assertAiRateLimit,
  assertAiSpendGate,
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

function parseDate(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (us) {
    const month = us[1].padStart(2, "0");
    const day = us[2].padStart(2, "0");
    let year = us[3];
    if (year.length === 2) year = `20${year}`;
    return `${year}-${month}-${day}`;
  }
  return null;
}

function parseNumber(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw !== "string") return null;
  const cleaned = raw.replace(/[,$]/g, "").replace(/[^\d.\-]/g, "");
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

function normalizeReceiptAnalysis(
  raw: Record<string, unknown>,
): ReceiptVisionAnalysis {
  const partsRaw = Array.isArray(raw.parts)
    ? raw.parts
    : Array.isArray(raw.parts_replaced)
      ? raw.parts_replaced
      : [];
  const parts = partsRaw
    .map((p) => {
      if (typeof p === "string") return p.trim();
      if (p && typeof p === "object" && "name" in p) {
        return String((p as { name: unknown }).name || "").trim();
      }
      return "";
    })
    .filter(Boolean)
    .slice(0, 20);

  const categoryRaw =
    typeof raw.category === "string" ? raw.category : "general";
  const category = normalizeMaintenanceCategory(categoryRaw);
  const confRaw =
    typeof raw.confidence === "string" ? raw.confidence.toLowerCase() : "low";
  const confidence =
    confRaw === "high" || confRaw === "medium" || confRaw === "low"
      ? confRaw
      : "low";

  const cost =
    parseNumber(raw.cost_usd) ??
    parseNumber(raw.costUsd) ??
    parseNumber(raw.total) ??
    parseNumber(raw.amount);

  return {
    performedAt:
      parseDate(raw.performed_at) ??
      parseDate(raw.performedAt) ??
      parseDate(raw.date) ??
      parseDate(raw.service_date),
    title:
      typeof raw.title === "string"
        ? raw.title.trim() || null
        : typeof raw.service === "string"
          ? raw.service.trim() || null
          : typeof raw.job === "string"
            ? raw.job.trim() || null
            : null,
    category: (MAINTENANCE_CATEGORIES as string[]).includes(category)
      ? category
      : "general",
    mileage:
      parseNumber(raw.mileage) ??
      parseNumber(raw.odometer) ??
      parseNumber(raw.miles),
    costUsd: cost != null && cost >= 0 ? Math.round(cost * 100) / 100 : null,
    parts,
    shopName:
      typeof raw.shop_name === "string"
        ? raw.shop_name.trim() || null
        : typeof raw.shopName === "string"
          ? raw.shopName.trim() || null
          : typeof raw.dealer === "string"
            ? raw.dealer.trim() || null
            : null,
    notes: typeof raw.notes === "string" ? raw.notes.trim() || null : null,
    confidence,
    raw_text_glimpse:
      typeof raw.raw_text_glimpse === "string"
        ? raw.raw_text_glimpse.trim().slice(0, 400) || null
        : null,
  };
}

/**
 * POST /api/vision/analyze-receipt
 *
 * Extract structured service / invoice fields from a receipt photo.
 * Auth: Bearer <supabase access_token>
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireVerifiedAiUser(req);
    await assertAiRateLimit(user.id, "vision", user.email);
    await assertAiSpendGate(user.id, {
      needsVision: true,
      email: user.email,
    });

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

    const visionPrompt = `You are reading a vehicle repair invoice, service receipt, or maintenance shop work order photo.
Vehicle context (may be incomplete): ${ymm || "unknown"}${
      vehicle?.engine ? ` · ${vehicle.engine}` : ""
    } (${market}).

Extract service history fields that are clearly visible. Do NOT invent amounts, dates, or parts.

Return ONLY valid JSON:
{
  "performed_at": "YYYY-MM-DD or null",
  "title": "short job title e.g. Oil change / Brake pads",
  "category": "general|oil|brakes|tires|engine|electrical|suspension|filter|other",
  "mileage": 85420,
  "cost_usd": 129.99,
  "parts": ["Oil filter", "5W-30 oil"],
  "shop_name": "shop or dealer name or null",
  "notes": "one short sentence for DIY owner",
  "confidence": "high|medium|low",
  "raw_text_glimpse": "short OCR of key lines"
}

Rules:
- Dates: prefer ISO YYYY-MM-DD. If only MM/DD/YYYY is shown, convert.
- Mileage: integer miles (or km if clearly labeled — still return the number shown).
- cost_usd: grand total in USD dollars (number). If currency is not USD, still return the numeric total and note currency in notes.
- parts: replaced / sold parts only (not labor line names unless they are parts).
- If the image is not a receipt, set confidence to "low" and leave fields null/empty.
- Never invent OEM part numbers you cannot read.`;

    const messages: DeepSeekMessage[] = [
      {
        role: "system",
        content:
          "You are Garage Genius Receipt Vision. Output valid JSON only. Never invent service data you cannot read.",
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
    const { isAiCostHardCapEnabled } = await import("@/lib/ai-cost/config");
    if (!isAiCostHardCapEnabled()) {
      await assertAiTokenBudget(user.id, estimated, user.email);
    }

    const { content, usage, model, visionProvider } = await callVisionJson(
      messages,
      800,
    );
    const isKimi = visionProvider === "kimi";
    await consumeAiTokensBestEffort(
      user.id,
      Math.max(1, usage.total_tokens),
      {
        route: "vision",
        model,
        provider: isKimi ? "kimi" : "deepseek",
        skipMonthlyQuota: isKimi,
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        email: user.email,
        metadata: { visionProvider, kind: "receipt" },
      },
      "[/api/vision/analyze-receipt]",
    );

    const parsed = normalizeReceiptAnalysis(extractJsonObject(content));

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

    console.error("[/api/vision/analyze-receipt] unexpected", {
      message: error instanceof Error ? error.message : String(error),
    });

    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Receipt analysis failed. You can enter the details manually.",
      },
      { status: 500 },
    );
  }
}
