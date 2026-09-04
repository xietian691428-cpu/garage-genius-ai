import { NextRequest } from "next/server";
import {
  callDeepSeek,
  estimateTokensFromMessages,
  trimDeepSeekConversation,
  type DeepSeekMessage,
} from "@/lib/deepseek";
import { callChatWithOptionalVision } from "@/lib/vision";
import { ensureLegalDisclaimer } from "@/lib/legal-disclaimer";
import { applyInsuranceSafetyGuards } from "@/lib/insurance-coverage-rewrite";
import {
  formatInsuranceEducationBlock,
  isInsuranceOrModQuestion,
} from "@/lib/insurance-safety-copy";
import { applyDriveSafetyGuards, formatDriveSafetyBlock, isHighRiskDrivingSituation } from "@/lib/drive-safety";
import { formatUnitPreferenceBlock } from "@/lib/unit-preference";
import type { VehicleInfo } from "@/lib/types/chat";
import { buildChatSystemPrompt } from "@/lib/chat-system-prompt";
import {
  containsCjkChars,
  detectReplyLanguageHint,
  enforceNoCjkAssistantReply,
  formatCjkRegenPrompt,
  latestUserPlainText,
  productAssistantLanguage,
  turnReplyLanguageLock,
} from "@/lib/reply-language";
import { createSupabaseUserClient, createSupabaseAdmin } from "@/lib/supabase-admin";
import { tokenService } from "@/lib/token-service";
import {
  AI_ROUTE_TOKEN_FLOOR,
  aiAbuseResponse,
  assertAiRateLimit,
  assertAiSpendGate,
  assertAiTokenBudget,
  assertEmailVerified,
  consumeAiTokensBestEffort,
  getBearerToken,
} from "@/lib/ai-abuse";
import { aiUpstreamResponse } from "@/lib/ai-errors";
import { ragService } from "@/lib/rag";
import {
  entitlementsForTier,
  ragMatchLimit,
} from "@/lib/types/subscription";
import {
  extractFocusFromRagHits,
  resolveFocusCommand,
} from "@/lib/parse-ai-focus";
import {
  detectConfigConflicts,
  formatConflictsForPrompt,
} from "@/lib/vcdb/conflict";
import {
  matchAffiliateParts,
  formatAffiliateCatalogForPrompt,
  applyAffiliatePartsToReply,
} from "@/lib/affiliate-match";
import { fitmentSearchString } from "@/lib/vcdb/format";
import { isQaUnlockEnabled } from "@/lib/qa-mode";
import { normalizeDiySkill } from "@/lib/diy-skill";
import {
  applyObdHonestyGuards,
  hasLiveObdAdapter,
  parseObdAdapterPreference,
} from "@/lib/obd-preference";
import {
  assistantContinuesStaleFocus,
  formatStaleFocusRepairPrompt,
  logChatDrift,
  matchedStalePhrases,
  needsCriticalRaisedState,
  parseTurnFocus,
  prepareDriftForChatTurn,
} from "@/lib/chat-intent-drift";
import { observeChatSafetyTurn } from "@/lib/pilot/observe-chat-safety";
import {
  logSafetyObserveEvents,
  recallDegradedFromAnchorBlock,
  safetyEventsMetadata,
  type SafetyObserveEvent,
} from "@/lib/safety-observe-events";
import type { TurnFocus } from "@/lib/chat-intent-drift";
import {
  describeAnchorsForLog,
  gatherVehicleFactAnchors,
} from "@/lib/vehicle-data/anchors";
import { isVehicleDataDebug } from "@/lib/vehicle-data/config";
import { maskVin } from "@/lib/vehicle-data/vin";
import { specGapMetadata, classifySpecGapIntents } from "@/lib/spec-gap-intent";
import { applySpecOutputGate, inventedSpecFailures } from "@/lib/spec-discipline";
import { applyDiagnosticToneGuards } from "@/lib/diagnostic-tone";
import { analyzeChatImage } from "@/lib/vision/kimi-client";
import { dtcTextFromAnalysis } from "@/lib/vision/format-analysis";
import { CHAT_VISION_MAX_IMAGES, isLowTrustAnalysis } from "@/lib/vision/types";
import { logTokenUsage } from "@/lib/log-token-usage";
import {
  bindChatVehicleIdentity,
  bindConversationFocusToVehicle,
  loadOwnedGarageVehicle,
  vehicleSelectionMismatch,
  VEHICLE_NOT_OWNED_CODE,
  VEHICLE_SELECTION_MISMATCH_CODE,
} from "@/lib/chat-vehicle-ownership";
import { formatVehicleIdentityPrompt } from "@/lib/vehicle-data/ymm-conflict";
import {
  formatExitUnderRepairPrompt,
  needsExitUnderRepair,
} from "@/lib/pilot/safety-observe-phrases";

export const runtime = "nodejs";
/** Allow RAG + DeepSeek within Vercel serverless limits (no OpenAI fallback). */
export const maxDuration = 60;

/** Ensure AI reply includes liability disclaimer + insurance soft rewrite. */
function ensureDisclaimer(content: string, userPlainText?: string): string {
  const hint = detectReplyLanguageHint(userPlainText);
  const driven = applyDriveSafetyGuards(content, userPlainText);
  return ensureLegalDisclaimer(
    applyInsuranceSafetyGuards(driven, { userContext: userPlainText }),
    productAssistantLanguage(hint),
  );
}

function getAccessToken(req: NextRequest): string | null {
  return getBearerToken(req);
}

async function resolveRagLimit(userId: string): Promise<number> {
  if (isQaUnlockEnabled()) {
    return ragMatchLimit("deep");
  }
  try {
    const plan = await tokenService.getUserPlan(userId);
    // TokenPlan aligns with SubscriptionTier for free/pro/pro_heavy
    const tier =
      plan === "pro_heavy" ? "pro_heavy" : plan === "pro" ? "pro" : "free";
    return ragMatchLimit(entitlementsForTier(tier).ragDepth);
  } catch {
    return ragMatchLimit("basic");
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      messages,
      image,
      images,
      selectedVehicleId,
      playbookSlug,
      coachSlug,
      maintenanceSummary,
      conversationFocus: conversationFocusRaw,
    } = body as {
      messages?: DeepSeekMessage[];
      /** @deprecated prefer `images` */
      image?: string;
      images?: string[];
      currentVehicle?: VehicleInfo;
      /** Header / switcher vehicle_id — must match currentVehicle.id when both set. */
      selectedVehicleId?: string;
      /** Optional coach guide context for admin token analytics */
      playbookSlug?: string;
      coachSlug?: string;
      /** Client-formatted recent maintenance_records for multi-turn context */
      maintenanceSummary?: string | null;
      /** Per-vehicle focus from localStorage — never mix across vehicle_id. */
      conversationFocus?: {
        previous?: TurnFocus | null;
        abandoned?: TurnFocus | null;
        vehicleId?: string;
        apiHistoryFromId?: string | null;
      } | null;
    };
    let currentVehicle = (body as { currentVehicle?: VehicleInfo }).currentVehicle;

    if (!currentVehicle?.make || !currentVehicle?.model) {
      return Response.json(
        { error: "Vehicle information is required" },
        { status: 400 },
      );
    }

    if (!currentVehicle.id?.trim()) {
      return Response.json(
        {
          error: "Select a garage vehicle before chatting.",
          code: VEHICLE_NOT_OWNED_CODE,
        },
        { status: 400 },
      );
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      return Response.json(
        { error: "Messages are required" },
        { status: 400 },
      );
    }

    const accessToken = getAccessToken(request);
    if (!accessToken) {
      return Response.json(
        {
          error:
            "Sign in required to use AI chat (token quota tracking). Please sign in and try again.",
        },
        { status: 401 },
      );
    }

    const userClient = createSupabaseUserClient(accessToken);
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return Response.json(
        { error: "Invalid or expired session. Please sign in again." },
        { status: 401 },
      );
    }

    try {
      assertEmailVerified(user);
    } catch (err) {
      const blocked = aiAbuseResponse(err);
      if (blocked) return blocked;
      throw err;
    }

    // Anti-abuse: per-user hourly/daily request caps (before RAG / DeepSeek)
    await assertAiRateLimit(user.id, "chat", user.email);

    if (vehicleSelectionMismatch(selectedVehicleId, currentVehicle.id)) {
      return Response.json(
        {
          error:
            "Vehicle in the header does not match this request. Refresh chat and try again.",
          code: VEHICLE_SELECTION_MISMATCH_CODE,
        },
        { status: 409 },
      );
    }

    let owned: VehicleInfo | null = null;
    try {
      owned = await loadOwnedGarageVehicle(
        userClient,
        user.id,
        currentVehicle.id,
      );
    } catch (err) {
      console.warn("[/api/chat] vehicle ownership lookup failed", {
        message: err instanceof Error ? err.message : String(err),
      });
      return Response.json(
        {
          error: "Could not verify the selected vehicle. Refresh and try again.",
          code: VEHICLE_NOT_OWNED_CODE,
        },
        { status: 503 },
      );
    }
    if (!owned) {
      return Response.json(
        {
          error:
            "This vehicle is not in your garage. Refresh and select a saved vehicle.",
          code: VEHICLE_NOT_OWNED_CODE,
        },
        { status: 403 },
      );
    }
    currentVehicle = bindChatVehicleIdentity(currentVehicle, owned);

    const conversationFocus = bindConversationFocusToVehicle(
      conversationFocusRaw,
      currentVehicle.id,
    );

    const lastUserMessage = [...messages]
      .reverse()
      .find((m) => m.role === "user");
    const content =
      typeof lastUserMessage?.content === "string"
        ? lastUserMessage.content
        : "";

    const visionImages = [
      ...(Array.isArray(images) ? images : []),
      ...(image ? [image] : []),
    ].filter(Boolean);
    // de-dupe while preserving order
    const uniqueImages = [...new Set(visionImages)].slice(
      0,
      CHAT_VISION_MAX_IMAGES,
    );

    await assertAiSpendGate(user.id, {
      needsVision: uniqueImages.length > 0,
      email: user.email,
    });

    let userMessages = [...messages];

    let visionPrep: Awaited<ReturnType<typeof analyzeChatImage>> | null = null;
    if (uniqueImages[0]) {
      visionPrep = await analyzeChatImage(uniqueImages[0], content);
      if (visionPrep.billed) {
        await logTokenUsage({
          userId: user.id,
          route: "vision",
          provider: "kimi",
          model: visionPrep.model || "kimi-k3",
          promptTokens: visionPrep.usage?.prompt_tokens,
          completionTokens: visionPrep.usage?.completion_tokens,
          totalTokens: Math.max(
            1,
            visionPrep.usage?.total_tokens || 1,
          ),
          feature: "Chat photo",
          metadata: { kind: "chat_photo", requestId: visionPrep.requestId },
        });
      }
    }

    const visionDtcBlob = dtcTextFromAnalysis(visionPrep?.analysis ?? null);
    const textForFacts = [content, visionDtcBlob].filter(Boolean).join("\n");

    // ── RAG retrieval (plan depth → match limit) ─────────
    const ragLimit = await resolveRagLimit(user.id);
    const conflicts = detectConfigConflicts(currentVehicle, textForFacts);
    const conflictContext = formatConflictsForPrompt(conflicts);

    const ragQuery =
      textForFacts.trim().length < 24
        ? `${fitmentSearchString(currentVehicle)} ${textForFacts}`.trim()
        : textForFacts.trim() ||
          `${fitmentSearchString(currentVehicle)} diagnosis`;

    // DIY skill band + OBD adapter preference (profiles)
    let diySkill = "beginner";
    let obdPreference = parseObdAdapterPreference(null);
    try {
      const admin = createSupabaseAdmin();
      const { data: prof } = await admin
        .from("profiles")
        .select(
          "diy_skill, has_obd_adapter, has_obd_adapter_source, has_obd_adapter_updated_at",
        )
        .eq("id", user.id)
        .maybeSingle();
      diySkill = normalizeDiySkill(prof?.diy_skill);
      obdPreference = parseObdAdapterPreference(prof);
    } catch {
      /* keep defaults */
    }

    const ragHits = await ragService.retrieveRelevantKnowledge(
      ragQuery,
      {
        make: currentVehicle.make,
        model: currentVehicle.model,
        year: Number(currentVehicle.year) || new Date().getFullYear(),
        market: currentVehicle.market,
      },
      ragLimit,
      {
        diySkill,
        mileage:
          typeof currentVehicle.mileage === "number"
            ? currentVehicle.mileage
            : null,
      },
    );

    void import("@/lib/flywheel").then(({ logRagRetrievalEvent }) =>
      logRagRetrievalEvent({
        userId: user.id,
        route: "chat",
        queryPreview: ragQuery,
        hitIds: ragHits
          .map((h) => h.id)
          .filter((id): id is string => Boolean(id)),
        hitTitles: ragHits
          .map((h) => h.title || "")
          .filter((t) => Boolean(t)),
        vehicleMake: currentVehicle.make,
        vehicleModel: currentVehicle.model,
      }),
    );

    const ragContext = ragService.formatKnowledgeForPrompt(ragHits, {
      market: currentVehicle.market,
      diySkill,
      make: currentVehicle.make,
      model: currentVehicle.model,
      year: Number(currentVehicle.year) || null,
      mileage:
        typeof currentVehicle.mileage === "number"
          ? currentVehicle.mileage
          : null,
    });
    const ragFocusHint = extractFocusFromRagHits(ragHits);

    // ── Affiliate catalog first (Admin affiliate_parts) ──
    const affiliateMatches = await matchAffiliateParts(currentVehicle, {
      query: content,
      limit: 8,
      minScore: 0,
    });
    // Prefer rows that actually relate to the question when possible
    const prioritized =
      affiliateMatches.some((m) => m.matchScore >= 6)
        ? affiliateMatches.filter((m) => m.matchScore >= 4)
        : affiliateMatches.filter((m) => m.matchScore >= 5).length > 0
          ? affiliateMatches.filter((m) => m.matchScore >= 5)
          : affiliateMatches.slice(0, 4);

    const affiliateCatalog = formatAffiliateCatalogForPrompt(
      prioritized,
      currentVehicle,
    );

    const maintenanceCap =
      typeof maintenanceSummary === "string"
        ? maintenanceSummary.length > 3_000
          ? `${maintenanceSummary.slice(0, 3_000)}\n…[truncated]`
          : maintenanceSummary
        : null;

    const userPlainForLang = latestUserPlainText(userMessages) || content;
    const replyLangHint = detectReplyLanguageHint(userPlainForLang);

    let factAnchors: string | null = null;
    try {
      factAnchors = await gatherVehicleFactAnchors(
        currentVehicle,
        textForFacts,
      );
      if (isVehicleDataDebug()) {
        console.log("[vehicle-data] chat.anchors", {
          vin: maskVin(currentVehicle.vin),
          ...describeAnchorsForLog(factAnchors),
        });
      }
    } catch {
      factAnchors = null;
    }

    const identityPrompt = formatVehicleIdentityPrompt(currentVehicle);
    if (identityPrompt) {
      factAnchors = factAnchors
        ? `${identityPrompt}\n\n${factAnchors}`
        : identityPrompt;
    }

    const turnBlocks = [
      formatUnitPreferenceBlock(currentVehicle.market, userPlainForLang),
      isInsuranceOrModQuestion(userPlainForLang)
        ? formatInsuranceEducationBlock()
        : null,
      isHighRiskDrivingSituation(userPlainForLang)
        ? formatDriveSafetyBlock()
        : null,
    ].filter(Boolean);
    if (turnBlocks.length) {
      factAnchors = factAnchors
        ? `${factAnchors}\n\n${turnBlocks.join("\n\n")}`
        : turnBlocks.join("\n\n");
    }

    // Intent reset: after vehicle gate + language lock inputs, before DeepSeek.
    const focusVehicleOk =
      !conversationFocus?.vehicleId ||
      conversationFocus.vehicleId === currentVehicle.id;
    const { drift, conversation, systemBlock } = prepareDriftForChatTurn({
      messages: userMessages,
      previousFocus: focusVehicleOk ? conversationFocus?.previous : null,
      vehicleId: currentVehicle.id,
      apiHistoryFromId: focusVehicleOk
        ? conversationFocus?.apiHistoryFromId
        : null,
    });
    userMessages = conversation as DeepSeekMessage[];

    const fullMessages: DeepSeekMessage[] = trimDeepSeekConversation(
      [
        buildChatSystemPrompt(
          currentVehicle,
          uniqueImages.length > 0,
          ragContext,
          conflictContext,
          affiliateCatalog,
          maintenanceCap,
          diySkill,
          obdPreference,
          factAnchors,
        ),
        // Hard lock after history bias: mid-thread ZH→EN (or reverse) must follow latest user msg.
        {
          role: "system",
          content: turnReplyLanguageLock(replyLangHint),
        },
        ...(systemBlock
          ? [{ role: "system" as const, content: systemBlock }]
          : []),
        ...userMessages,
      ],
      { imageHeavy: uniqueImages.length > 0 },
    );

    const estimatedTokens = Math.max(
      AI_ROUTE_TOKEN_FLOOR.chat,
      estimateTokensFromMessages(fullMessages),
    );
    await assertAiTokenBudget(user.id, estimatedTokens, user.email);

    let {
      content: reply,
      usage,
      model: pipelineModel,
      visionProvider,
      imageAnalysisSummary,
    } = await callChatWithOptionalVision(fullMessages, {
      analysis: visionPrep?.analysis ?? null,
      analysisModel: visionPrep?.model,
      perceptionFailed: Boolean(visionPrep?.failed),
      perceptionDisabled: Boolean(visionPrep?.disabled),
    });
    let actualTokensUsed = Math.max(1, usage.total_tokens);
    let promptTokens = usage.prompt_tokens;
    let completionTokens = usage.completion_tokens;

    const abandonedFocus =
      (focusVehicleOk ? parseTurnFocus(conversationFocus?.abandoned) : null) ??
      (drift.shouldReset ? drift.previousFocus : null) ??
      null;
    const staleHits = matchedStalePhrases(
      reply,
      abandonedFocus,
      drift.currentFocus,
    );
    const shouldStaleRepair =
      uniqueImages.length === 0 &&
      assistantContinuesStaleFocus(reply, abandonedFocus, drift.currentFocus);
    const shouldExitUnderRepair = needsExitUnderRepair(
      reply,
      needsCriticalRaisedState(drift.currentFocus),
      Boolean(drift.currentFocus.vehicleRaised) ||
        /\[CRITICAL STATE\]/i.test(systemBlock || ""),
    );
    const shouldRepair = shouldStaleRepair || shouldExitUnderRepair;
    logChatDrift(
      {
        historySentToDeepSeek: userMessages.length,
        apiHistoryFromId: conversationFocus?.apiHistoryFromId ?? null,
        repairTriggered: shouldRepair,
        staleHits,
        exitUnderRepair: shouldExitUnderRepair,
      },
      currentVehicle.id,
    );
    if (shouldRepair) {
      try {
        const repairBlocks = [
          shouldStaleRepair
            ? formatStaleFocusRepairPrompt(drift, abandonedFocus)
            : "",
          shouldExitUnderRepair ? formatExitUnderRepairPrompt() : "",
        ]
          .filter(Boolean)
          .join("\n\n");
        const repaired = await callDeepSeek(
          trimDeepSeekConversation(
            [
              ...fullMessages,
              {
                role: "system",
                content: repairBlocks,
              },
            ],
            { imageHeavy: false },
          ),
        );
        reply = repaired.content;
        actualTokensUsed += Math.max(1, repaired.usage.total_tokens);
        promptTokens += repaired.usage.prompt_tokens;
        completionTokens += repaired.usage.completion_tokens;
      } catch (err) {
        console.warn("[/api/chat] stale-focus repair skipped", {
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // CJK leak: one English/Spanish regen before safety observe + output gates.
    // Deterministic strip still runs on finalContent so no CJK reaches the user.
    const assistantLang = productAssistantLanguage(replyLangHint);
    if (containsCjkChars(reply)) {
      try {
        const regenerated = await callDeepSeek(
          trimDeepSeekConversation(
            [
              ...fullMessages,
              { role: "assistant", content: reply },
              {
                role: "system",
                content: formatCjkRegenPrompt(assistantLang),
              },
            ],
            { imageHeavy: false },
          ),
        );
        reply = regenerated.content;
        actualTokensUsed += Math.max(1, regenerated.usage.total_tokens);
        promptTokens += regenerated.usage.prompt_tokens;
        completionTokens += regenerated.usage.completion_tokens;
        // Regen can reintroduce stay-under coaching — re-run exit-under only if needed.
        if (
          needsExitUnderRepair(
            reply,
            needsCriticalRaisedState(drift.currentFocus),
            Boolean(drift.currentFocus.vehicleRaised) ||
              /\[CRITICAL STATE\]/i.test(systemBlock || ""),
          )
        ) {
          try {
            const repaired = await callDeepSeek(
              trimDeepSeekConversation(
                [
                  ...fullMessages,
                  {
                    role: "system",
                    content: formatExitUnderRepairPrompt(),
                  },
                ],
                { imageHeavy: false },
              ),
            );
            reply = repaired.content;
            actualTokensUsed += Math.max(1, repaired.usage.total_tokens);
            promptTokens += repaired.usage.prompt_tokens;
            completionTokens += repaired.usage.completion_tokens;
          } catch (err) {
            console.warn("[/api/chat] exit-under after CJK regen skipped", {
              message: err instanceof Error ? err.message : String(err),
            });
          }
        }
      } catch (err) {
        console.warn("[/api/chat] CJK language regen skipped", {
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    observeChatSafetyTurn({
      vehicleId: currentVehicle.id,
      userMessage: userPlainForLang,
      reply,
      currentFocus: drift.currentFocus,
    });

    const specCtx = {
      oilCapacity: currentVehicle.oilCapacity,
      oilViscosity: currentVehicle.oilViscosity,
      oemNumbers: prioritized.map((p) => p.oem_number),
    };
    const safetyEvents: SafetyObserveEvent[] = [];
    if (drift.shouldReset) safetyEvents.push("drift_reset");
    if (shouldExitUnderRepair) safetyEvents.push("exit_under_repair");
    if (
      visionPrep?.analysis &&
      isLowTrustAnalysis(visionPrep.analysis)
    ) {
      safetyEvents.push("vision_reject");
    }
    if (recallDegradedFromAnchorBlock(factAnchors)) {
      safetyEvents.push("recall_degraded");
    }
    if (inventedSpecFailures(reply, specCtx).length > 0) {
      safetyEvents.push("spec_block");
    }
    logSafetyObserveEvents(
      safetyEvents,
      { route: "chat" },
      { userId: user.id },
    );

    const resolvedPlaybook =
      (typeof playbookSlug === "string" && playbookSlug.trim()) ||
      (typeof coachSlug === "string" && coachSlug.trim()) ||
      null;

    await consumeAiTokensBestEffort(
      user.id,
      actualTokensUsed,
      {
        route: "chat",
        model: "deepseek-chat",
        provider: "deepseek",
        promptTokens,
        completionTokens,
        playbookSlug: resolvedPlaybook,
        email: user.email,
        metadata: {
          make: currentVehicle.make,
          model: currentVehicle.model,
          pipelineModel: pipelineModel || "deepseek-chat",
          visionProvider,
          hasImages: uniqueImages.length > 0,
          imageCondition: imageAnalysisSummary?.condition ?? null,
          imageConfidence: imageAnalysisSummary?.confidence ?? null,
          ...specGapMetadata(classifySpecGapIntents(userPlainForLang)),
          ...safetyEventsMetadata(safetyEvents),
        },
      },
      "[/api/chat]",
    );

    const gatedContent = ensureDisclaimer(
      applyObdHonestyGuards(
        applyDiagnosticToneGuards(
          applySpecOutputGate(
            applyAffiliatePartsToReply(reply, prioritized, currentVehicle),
            specCtx,
          ),
        ),
        hasLiveObdAdapter(obdPreference),
      ),
      typeof content === "string" && content.trim()
        ? content
        : latestUserPlainText(fullMessages),
    );
    // After W1–W6 output gates: never leave CJK paragraphs for the user.
    const finalContent = ensureLegalDisclaimer(
      enforceNoCjkAssistantReply(gatedContent, replyLangHint),
      productAssistantLanguage(replyLangHint),
    );
    const suggestedFocus = resolveFocusCommand(finalContent, ragHits);

    return Response.json({
      content: finalContent,
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: actualTokensUsed,
      },
      rag: {
        count: ragHits.length,
        limit: ragLimit,
        titles: ragHits.map((h) => h.title).filter(Boolean),
      },
      /** Lightweight hits for client-side Focus merge (no huge content) */
      ragHits: ragHits.map((h) => ({
        id: h.id,
        title: h.title,
        content: (h.content || "").slice(0, 500),
        category: h.category,
        metadata: h.metadata,
        similarity: h.similarity,
      })),
      affiliateParts: prioritized.map((p) => ({
        id: p.id,
        oem_number: p.oem_number,
        name: p.name,
        brand: p.brand,
        category: p.category,
        price_min: p.price_min,
        price_max: p.price_max,
        matchScore: p.matchScore,
        source: "affiliate" as const,
      })),
      suggestedFocus,
      ragFocusHint,
      configConflicts: conflicts,
      drift: {
        shouldReset: drift.shouldReset,
        reason: drift.reason,
        summary: drift.currentFocus.summary,
      },
      conversationFocus: drift.currentFocus,
      imageAnalysis: imageAnalysisSummary,
    });
  } catch (error: unknown) {
    const abuse = aiAbuseResponse(error);
    if (abuse) return abuse;

    const upstream = aiUpstreamResponse(error);
    if (upstream) return upstream;

    console.error("[/api/chat] unexpected", {
      message: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : undefined,
    });

    const message =
      error instanceof Error ? error.message : "Unknown error";
    const isInsufficientBalance =
      message.includes("402") || message.includes("Insufficient Balance");
    const isQuota =
      message.includes("Insufficient tokens") ||
      message.includes("Token quota");

    return Response.json(
      {
        error: isQuota
          ? "Monthly AI quota is used up."
          : isInsufficientBalance
            ? "AI service is temporarily unavailable. Please try again later or contact support."
            : "AI service is temporarily unavailable. Please try again.",
        code: isQuota
          ? "TOKEN_QUOTA_EXCEEDED"
          : isInsufficientBalance
            ? "INSUFFICIENT_BALANCE"
            : "AI_UNAVAILABLE",
        retryable: !isQuota && !isInsufficientBalance,
      },
      { status: isQuota || isInsufficientBalance ? 402 : 500 },
    );
  }
}
