import { NextRequest } from "next/server";
import {
  callDeepSeekJson,
  estimateTokensFromMessages,
  type DeepSeekMessage,
} from "@/lib/deepseek";
import { DISCLAIMER } from "@/lib/constants";
import { getDashboardRegion } from "@/lib/dashboard-regions";
import type { RegionInspection } from "@/lib/types/dashboard";
import type { VehicleInfo } from "@/lib/types/chat";
import {
  formatMarketContextBlock,
  normalizeVehicleMarket,
} from "@/lib/types/vehicle-market";
import {
  affiliateToRegionPurchasePart,
  categoryForFocusRegion,
  formatAffiliateCatalogForPrompt,
  formatAffiliatePrice,
  matchAffiliateParts,
} from "@/lib/affiliate-match";
import {
  AI_ROUTE_TOKEN_FLOOR,
  aiAbuseResponse,
  assertAiRateLimit,
  assertAiTokenBudget,
  consumeAiTokens,
  requireAiUser,
} from "@/lib/ai-abuse";
import { aiUpstreamResponse } from "@/lib/ai-errors";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import {
  computeVehicleFamiliarity,
  formatFamiliarityForPrompt,
} from "@/lib/vehicle-familiarity";
import { formatMaintenanceHistoryForPrompt } from "@/lib/chat-repair-loop";
import type { MaintenanceRecord } from "@/lib/types/maintenance";

const MIN_SYMPTOM_LENGTH = 3;

function buildInspectPrompt(
  regionName: string,
  regionDescription: string,
  vehicle: VehicleInfo,
  symptoms: string,
  isGeneral: boolean,
  affiliateCatalog?: string | null,
  maintenanceBlock?: string | null,
): string {
  const focus = isGeneral
    ? "Provide a concise general inspection guide for this area (no specific symptoms)."
    : `User symptoms: "${symptoms.trim()}" — focus diagnosis and steps on these symptoms first.`;

  const catalogBlock = affiliateCatalog?.trim()
    ? `\n${affiliateCatalog.trim()}\nIf catalog parts exist, use their OEM/brand/price/links in purchaseParts and partsTable.\n`
    : "";

  const historyBlock = maintenanceBlock?.trim()
    ? `\n${maintenanceBlock.trim()}\nPrefer citing logged jobs; do not re-recommend completed work unless wear intervals clearly apply.\n`
    : "";

  const market = normalizeVehicleMarket(vehicle.market);

  return `${formatMarketContextBlock(vehicle)}

Vehicle: ${vehicle.year} ${vehicle.make} ${vehicle.model}, ${vehicle.mileage.toLocaleString()} mi, ${vehicle.engine}.
Area: ${regionName} — ${regionDescription}
${focus}
${historyBlock}
${catalogBlock}
Specifications must follow ${market} region manuals and regulations.
Return ONLY valid JSON:
{
  "title": "string",
  "summary": "string (max 2 sentences)",
  "parts": [{ "name": "string", "role": "string", "lifespan": "string" }],
  "commonIssues": [{ "issue": "string", "severity": "low"|"medium"|"high", "probability": number }],
  "repairSteps": [{ "step": number, "title": "string", "description": "string", "tools": ["string"], "time": "string", "difficulty": "Easy"|"Medium"|"Hard" }],
  "visualGuides": [{ "title": "string", "youtubeQuery": "string", "photoPrompt": "string" }],
  "partsTable": [{ "part": "string", "oem": "string", "aftermarket": "string", "price": "string" }],
  "purchaseParts": [{
    "name": "string",
    "category": "replacement"|"consumable",
    "oemPartNumber": "string",
    "aftermarketBrand": "string",
    "aftermarketPartNumber": "string",
    "fitment": "string",
    "quantityNeeded": number,
    "unit": "each"|"pair"|"set"|"quart"|"liter",
    "estimatedPrice": "string e.g. $45-65",
    "installDifficulty": "Easy"|"Medium"|"Hard",
    "purchaseChannels": [{ "store": "Amazon"|"RockAuto"|"AutoZone"|"O'Reilly", "searchQuery": "string", "searchUrl": "full https URL with encoded query" }],
    "notes": "string optional fitment or compatibility note"
  }],
  "safetyNotes": ["string"]
}

Limits:
- Exactly 3 key parts, 3 issues, 3 repair steps, 1 visual guide
- Exactly 2 purchaseParts with REAL OEM/part numbers for ${vehicle.year} ${vehicle.make} ${vehicle.model}
- Prefer Affiliate Catalog rows when present; otherwise generate purchaseParts with 3-4 search URLs
- Use category "consumable" for oil, filters, fluids; "replacement" for wear parts`;
}

function normalizeInspection(
  raw: RegionInspection,
  regionName: string,
  vehicle: VehicleInfo,
): RegionInspection {
  return {
    title:
      raw.title ||
      `${vehicle.year} ${vehicle.make} ${vehicle.model} — ${regionName}`,
    summary: raw.summary || "Inspection overview for this vehicle area.",
    parts: (Array.isArray(raw.parts) ? raw.parts : []).slice(0, 3),
    commonIssues: (Array.isArray(raw.commonIssues) ? raw.commonIssues : []).slice(
      0,
      3,
    ),
    repairSteps: (Array.isArray(raw.repairSteps) ? raw.repairSteps : []).slice(
      0,
      3,
    ),
    visualGuides: (Array.isArray(raw.visualGuides) ? raw.visualGuides : []).slice(
      0,
      1,
    ),
    partsTable: (Array.isArray(raw.partsTable) ? raw.partsTable : []).slice(0, 4),
    purchaseParts: (Array.isArray(raw.purchaseParts)
      ? raw.purchaseParts
      : []
    ).slice(0, 4),
    safetyNotes: Array.isArray(raw.safetyNotes)
      ? [...raw.safetyNotes.slice(0, 2), DISCLAIMER]
      : [DISCLAIMER],
  };
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAiUser(request);
    await assertAiRateLimit(user.id, "inspect");

    const body = await request.json();
    const { regionId, symptoms, currentVehicle, allowGeneral } = body as {
      regionId?: string;
      symptoms?: string;
      currentVehicle?: VehicleInfo;
      allowGeneral?: boolean;
    };

    if (!regionId) {
      return Response.json({ error: "regionId is required" }, { status: 400 });
    }

    const region = getDashboardRegion(regionId);
    if (!region) {
      return Response.json({ error: "Unknown region" }, { status: 400 });
    }

    if (!currentVehicle?.make || !currentVehicle?.model) {
      return Response.json(
        { error: "Vehicle information is required" },
        { status: 400 },
      );
    }

    const trimmedSymptoms = (symptoms ?? "").trim();
    const isGeneral = Boolean(allowGeneral) && !trimmedSymptoms;

    if (!isGeneral && trimmedSymptoms.length < MIN_SYMPTOM_LENGTH) {
      return Response.json(
        {
          error:
            "Please describe your symptoms (at least 3 characters) for a focused AI guide.",
        },
        { status: 400 },
      );
    }

    const category = categoryForFocusRegion(regionId);
    const affiliateMatches = await matchAffiliateParts(currentVehicle, {
      query: `${region.name} ${trimmedSymptoms}`.trim(),
      category,
      limit: 4,
    });
    const affiliateCatalog = formatAffiliateCatalogForPrompt(affiliateMatches);

    let maintenanceBlock: string | null = null;
    try {
      if (currentVehicle.id) {
        const admin = createSupabaseAdmin();
        const { data } = await admin
          .from("maintenance_records")
          .select("*")
          .eq("user_id", user.id)
          .eq("vehicle_id", currentVehicle.id)
          .order("performed_at", { ascending: false })
          .limit(12);
        const records: MaintenanceRecord[] = (data ?? []).map((row) => ({
          id: row.id,
          userId: row.user_id,
          vehicleId: row.vehicle_id,
          title: row.title,
          category: row.category,
          description: row.description ?? undefined,
          mileage: row.mileage ?? undefined,
          costCents: row.cost_cents ?? undefined,
          partsUsed: Array.isArray(row.parts_used) ? row.parts_used : [],
          shopName:
            "shop_name" in row && row.shop_name
              ? String(row.shop_name)
              : undefined,
          performedAt: row.performed_at,
          source: row.source,
          notes: row.notes ?? undefined,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        }));
        const familiarity = computeVehicleFamiliarity(records);
        maintenanceBlock = formatMaintenanceHistoryForPrompt(records, {
          familiarityBlock: formatFamiliarityForPrompt(familiarity),
        });
      }
    } catch (err) {
      console.warn("[/api/dashboard/inspect] maintenance context:", err);
    }

    const messages: DeepSeekMessage[] = [
      {
        role: "system",
        content:
          "You are Garage Genius AI. Respond with valid JSON only. Be concise. Prefer Affiliate Catalog OEM/price/links when provided. Cite garage maintenance history when relevant.",
      },
      {
        role: "user",
        content: buildInspectPrompt(
          region.name,
          region.description,
          currentVehicle,
          trimmedSymptoms,
          isGeneral,
          affiliateCatalog,
          maintenanceBlock,
        ),
      },
    ];

    const estimated = Math.max(
      AI_ROUTE_TOKEN_FLOOR.inspect,
      estimateTokensFromMessages(messages),
    );
    await assertAiTokenBudget(user.id, estimated);

    const { content: reply, usage } = await callDeepSeekJson(messages, 1200);
    await consumeAiTokens(user.id, Math.max(1, usage.total_tokens), {
      route: "inspect",
      model: "deepseek-chat",
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
      metadata: { region: region.name },
    });

    const parsed = JSON.parse(reply) as RegionInspection;
    let inspection = normalizeInspection(
      parsed,
      region.name,
      currentVehicle,
    );

    // Catalog wins for Focus Mode purchase list when we have vehicle-fit matches
    if (affiliateMatches.length > 0) {
      const purchaseParts = affiliateMatches.map((m) =>
        affiliateToRegionPurchasePart(m, currentVehicle),
      );
      inspection = {
        ...inspection,
        purchaseParts,
        partsTable: affiliateMatches.map((m) => ({
          part: m.name,
          oem: m.oem_number,
          aftermarket: m.brand,
          price: formatAffiliatePrice(m),
        })),
      };
    }

    return Response.json({
      inspection,
      regionId,
      cached: false,
      affiliateCount: affiliateMatches.length,
      usage: {
        prompt_tokens: usage.prompt_tokens,
        completion_tokens: usage.completion_tokens,
        total_tokens: usage.total_tokens,
      },
    });
  } catch (error: unknown) {
    const abuse = aiAbuseResponse(error);
    if (abuse) return abuse;

    const upstream = aiUpstreamResponse(error);
    if (upstream) return upstream;

    console.error("[/api/dashboard/inspect] unexpected", {
      message: error instanceof Error ? error.message : String(error),
    });

    const message =
      error instanceof Error ? error.message : "Unknown error";
    const isInsufficientBalance =
      message.includes("402") || message.includes("Insufficient Balance");

    return Response.json(
      {
        error: isInsufficientBalance
          ? "DeepSeek account balance is insufficient. Please top up at platform.deepseek.com."
          : "AI inspection is temporarily unavailable. Please try again.",
        code: isInsufficientBalance
          ? "INSUFFICIENT_BALANCE"
          : "AI_UNAVAILABLE",
        retryable: !isInsufficientBalance,
      },
      { status: isInsufficientBalance ? 402 : 500 },
    );
  }
}
