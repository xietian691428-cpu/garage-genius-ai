import { NextRequest, NextResponse } from "next/server";
import {
  assertAiRateLimit,
  assertAiTokenBudget,
  assertEmailVerified,
  aiAbuseResponse,
  consumeAiTokens,
  getBearerToken,
} from "@/lib/ai-abuse";
import { callDeepSeekJson } from "@/lib/deepseek";
import { createSupabaseAdmin, createSupabaseUserClient } from "@/lib/supabase-admin";
import {
  collectCodesFromMessages,
  createShopReportId,
  truncateTranscript,
  vinLast8,
  buildShopReportPreview,
} from "@/lib/shop-report/context";
import { buildShopReportMessages } from "@/lib/shop-report/prompt";
import type { VehicleInfo } from "@/lib/types/chat";
import type {
  ShopReportFactor,
  ShopReportGenerateRequest,
  ShopReportPayload,
} from "@/lib/types/shop-report";
import { SHOP_REPORT_DISCLAIMER } from "@/lib/types/shop-report";

export const runtime = "nodejs";

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

function sanitizeFactors(raw: LlmShape["contributingFactors"]): ShopReportFactor[] {
  const out: ShopReportFactor[] = [];
  for (const f of raw || []) {
    const title = (f?.title || "").trim();
    const explanation = (f?.explanation || "").trim();
    const howToVerify = (f?.howToVerify || "").trim();
    if (!title || !explanation) continue;
    // Soft rewrite if model slipped into command tone
    const safeExpl = /replace\b|root cause is\b|you must\b/i.test(explanation)
      ? `Common causes reported for this combination include considerations around ${title.toLowerCase()}. These are for professional verification only.`
      : explanation;
    out.push({
      title,
      explanation: safeExpl,
      howToVerify:
        howToVerify ||
        "Verify with standard shop procedures and OEM guidance.",
    });
    if (out.length >= 5) break;
  }
  return out;
}

function sanitizeSteps(steps: string[]): string[] {
  return steps
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      if (/^replace\b/i.test(s)) {
        return `Inspect / verify condition related to: ${s.replace(/^replace\b/i, "").trim()}`;
      }
      return s;
    })
    .slice(0, 8);
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
        plate: null,
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
      contributingFactors: sanitizeFactors(parsed.contributingFactors),
      checksCompleted: asStringList(
        parsed.checksCompleted?.length
          ? parsed.checksCompleted
          : parsed.checksDone,
      ),
      technicianNextSteps: sanitizeSteps(
        asStringList(parsed.technicianNextSteps),
      ),
      ownerNotes: ownerNotes || null,
      disclaimer: SHOP_REPORT_DISCLAIMER,
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

    // Best-effort archive (migration 033). Ignore if table missing.
    try {
      const admin = createSupabaseAdmin();
      const vehicleId =
        vehicle.id && vehicle.id !== "coach-session" ? vehicle.id : null;
      const { error: archiveError } = await admin.from("shop_reports").insert({
        user_id: user.id,
        vehicle_id: vehicleId,
        report_code: reportId,
        source: payload.source,
        payload,
      });
      if (archiveError) {
        console.warn("[shop-report] archive skipped:", archiveError.message);
      }
    } catch (err) {
      console.warn(
        "[shop-report] archive skipped:",
        err instanceof Error ? err.message : err,
      );
    }

    return NextResponse.json({
      payload,
      preview,
      archived: true,
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
