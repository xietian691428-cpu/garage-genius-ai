import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  assertAiRateLimit,
  assertAiTokenBudget,
  assertEmailVerified,
  aiAbuseResponse,
  consumeAiTokens,
  getBearerToken,
} from "@/lib/ai-abuse";
import { assertShopReportQuota } from "@/lib/shop-report-limits";
import { callDeepSeekJson } from "@/lib/deepseek";
import { createSupabaseAdmin, createSupabaseUserClient } from "@/lib/supabase-admin";
import { getAppBaseUrl } from "@/lib/app-url";
import {
  collectCodesFromMessages,
  createShopReportId,
  truncateTranscript,
  vinLast8,
  buildShopReportPreview,
} from "@/lib/shop-report/context";
import { buildShopReportMessages } from "@/lib/shop-report/prompt";
import { toPublicShopReportPayload } from "@/lib/shop-report/public-view";
import {
  sanitizeShopReportFactors,
  sanitizeShopReportSteps,
} from "@/lib/shop-report/sanitize";
import type { VehicleInfo } from "@/lib/types/chat";
import type {
  ShopReportGenerateRequest,
  ShopReportPayload,
} from "@/lib/types/shop-report";
import { SHOP_REPORT_DISCLAIMER } from "@/lib/types/shop-report";

export const runtime = "nodejs";

const SHARE_DAYS = 30;

type LlmShape = {
  symptoms?: string;
  conditions?: string;
  checksDone?: string[];
  liveDataSummary?: string | null;
  dataSourceNote?: string | null;
  contributingFactors?: Array<{
    title?: string;
    explanation?: string;
    howToVerify?: string;
  }>;
  checksCompleted?: string[];
  technicianNextSteps?: string[];
};

function asStringList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean)
    .slice(0, 12);
}

function makePublicToken(): string {
  return randomBytes(24).toString("base64url");
}

function sanitizeImages(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is string => typeof x === "string")
    .filter(
      (x) =>
        x.startsWith("data:image/") &&
        x.length > 2_000 &&
        x.length < 500_000,
    )
    .slice(0, 3);
}

export async function POST(req: NextRequest) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userClient = createSupabaseUserClient(token);
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
      assertEmailVerified(user);
    } catch (err) {
      const blocked = aiAbuseResponse(err);
      if (blocked) return blocked;
      throw err;
    }

    await assertAiRateLimit(user.id, "chat");
    // Plan shop-report cap (Free/Trial) before spending tokens / calling the model.
    const reportQuota = await assertShopReportQuota(user.id);

    const body = (await req.json()) as ShopReportGenerateRequest;
    const vehicle = body.vehicle as VehicleInfo | undefined;
    if (!vehicle?.year || !vehicle.make || !vehicle.model) {
      return NextResponse.json(
        { error: "Vehicle information is required." },
        { status: 400 },
      );
    }

    const messages = body.messages ?? [];
    const coachText = [
      body.coachContext?.scenarioTitle,
      body.coachContext?.completionText,
      body.coachContext?.lastStepText,
    ]
      .filter(Boolean)
      .join("\n\n");

    const preview = buildShopReportPreview({
      vehicle,
      messages,
      coachText,
    });
    if (!preview.hasEnoughData) {
      return NextResponse.json(
        {
          error:
            preview.reasonIfEmpty ||
            "Please complete a diagnosis first.",
          code: "insufficient_data",
        },
        { status: 400 },
      );
    }

    await assertAiTokenBudget(user.id, 800);

    const codes = collectCodesFromMessages(messages);
    const transcript = truncateTranscript(messages);
    const ownerNotes = (body.options?.ownerNotes || "").trim().slice(0, 500);
    const includeImages = Boolean(body.options?.includeImages);
    const images = includeImages ? sanitizeImages(body.images) : [];

    const llm = await callDeepSeekJson(
      buildShopReportMessages({
        vehicle,
        transcript,
        codes,
        ownerNotes,
        source: body.source === "coach" ? "coach" : "chat",
        coachContext: coachText || undefined,
      }),
      2200,
    );

    let parsed: LlmShape = {};
    try {
      parsed = JSON.parse(llm.content) as LlmShape;
    } catch {
      return NextResponse.json(
        { error: "Could not prepare the professional summary. Please retry." },
        { status: 502 },
      );
    }

    try {
      await consumeAiTokens(user.id, Math.max(1, llm.usage.total_tokens), {
        route: "other",
        model: "deepseek-chat",
        promptTokens: llm.usage.prompt_tokens,
        completionTokens: llm.usage.completion_tokens,
        playbookSlug: body.coachContext?.scenarioSlug ?? null,
        feature: "shop_report_generated",
        metadata: {
          event: "shop_report_generated",
          source: body.source === "coach" ? "coach" : "chat",
          vehicleId: vehicle.id,
          codeCount: codes.length,
          imageCount: images.length,
        },
      });
    } catch (consumeError) {
      return NextResponse.json(
        {
          error:
            consumeError instanceof Error
              ? consumeError.message
              : "Not enough tokens to generate a shop report.",
          code: "token_limit",
        },
        { status: 402 },
      );
    }

    const reportId = createShopReportId();
    const includeFullVin = Boolean(body.options?.includeFullVin);
    const vin = vehicle.vin?.trim().toUpperCase() || null;
    const plate =
      vehicle.licensePlate?.trim().toUpperCase().slice(0, 16) || null;
    const publicToken = makePublicToken();
    const expiresAt = new Date(
      Date.now() + SHARE_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();

    const payload: ShopReportPayload = {
      reportId,
      generatedAtIso: new Date().toISOString(),
      source: body.source === "coach" ? "coach" : "chat",
      vehicle: {
        year: vehicle.year,
        make: vehicle.make,
        model: vehicle.model,
        submodel: vehicle.submodel,
        mileage: vehicle.mileage,
        vinLast8: vinLast8(vin),
        vinFull: includeFullVin ? vin : null,
        plate,
      },
      ownerObservations: {
        symptoms: (parsed.symptoms || preview.symptomPreview).trim(),
        conditions: (parsed.conditions || "").trim(),
        checksDone: asStringList(parsed.checksDone),
      },
      diagnosticData: {
        codes,
        liveDataSummary: parsed.liveDataSummary?.trim() || null,
        dataSourceNote: parsed.dataSourceNote?.trim() || null,
      },
      contributingFactors: sanitizeShopReportFactors(
        parsed.contributingFactors,
      ),
      checksCompleted: asStringList(
        parsed.checksCompleted?.length
          ? parsed.checksCompleted
          : parsed.checksDone,
      ),
      technicianNextSteps: sanitizeShopReportSteps(
        asStringList(parsed.technicianNextSteps),
      ),
      ownerNotes: ownerNotes || null,
      disclaimer: SHOP_REPORT_DISCLAIMER,
      images: images.length ? images : undefined,
    };

    if (payload.contributingFactors.length === 0) {
      payload.contributingFactors = [
        {
          title: "Further verification needed",
          explanation:
            "Common causes reported for this combination vary by freeze-frame data and recent repairs. These are for professional verification only.",
          howToVerify:
            "Confirm codes, monitor relevant PIDs, and compare against OEM diagnostic flowcharts.",
        },
      ];
    }

    // Archive + public share: store public-safe payload (no full VIN).
    const archivePayload = toPublicShopReportPayload(payload);
    let archived = false;
    const vehicleId =
      vehicle.id && vehicle.id !== "coach-session" ? vehicle.id : null;

    try {
      const admin = createSupabaseAdmin();
      const { error: archiveError } = await admin.from("shop_reports").insert({
        user_id: user.id,
        vehicle_id: vehicleId,
        report_code: reportId,
        source: payload.source,
        payload: archivePayload,
        public_token: publicToken,
        expires_at: expiresAt,
      });
      if (archiveError) {
        console.warn("[shop-report] archive skipped:", archiveError.message);
      } else {
        archived = true;
      }
    } catch (err) {
      console.warn(
        "[shop-report] archive skipped:",
        err instanceof Error ? err.message : err,
      );
    }

    const base = getAppBaseUrl(req.nextUrl.origin);
    const publicUrl = archived ? `${base}/r/${publicToken}` : null;

    return NextResponse.json({
      payload,
      preview,
      archived,
      public_token: archived ? publicToken : null,
      public_url: publicUrl,
      expires_at: archived ? expiresAt : null,
      quota: {
        limit: reportQuota.limit,
        used: archived ? reportQuota.used + 1 : reportQuota.used,
        remaining: reportQuota.unlimited
          ? null
          : Math.max(
              0,
              (reportQuota.limit ?? 0) -
                (archived ? reportQuota.used + 1 : reportQuota.used),
            ),
        unlimited: reportQuota.unlimited,
        periodYm: reportQuota.periodYm,
      },
    });
  } catch (err) {
    const blocked = aiAbuseResponse(err);
    if (blocked) return blocked;
    console.error("[shop-report/generate]", err);
    return NextResponse.json(
      {
        error:
          "Shop report generation failed. Please try again in a few minutes.",
      },
      { status: 500 },
    );
  }
}
