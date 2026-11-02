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
  fetchPutcoFitment,
  formatPutcoFitmentBlock,
  putcoCountryForMarket,
  shouldQueryPutco,
} from "@/lib/putco";
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
import {
  applyW9OutputGuards,
  applyW10OutputGuards,
  deriveIntake,
  formatIntakeStateBlock,
} from "@/lib/intake";
import { formatEvidenceBlock } from "@/lib/evidence/grades";
import { formatStopRuleBlock } from "@/lib/safety/stop-rules";
import { specGapMetadata, classifySpecGapIntents } from "@/lib/spec-gap-intent";
import { applySpecOutputGate, inventedSpecFailures } from "@/lib/spec-discipline";
import { applyDiagnosticToneGuards } from "@/lib/diagnostic-tone";
import { analyzeChatImage } from "@/lib/vision/kimi-client";
import { dtcTextFromAnalysis } from "@/lib/vision/format-analysis";
import {
  CHAT_VISION_MAX_IMAGES,
  highConfidenceHousingAssist,
  isLowTrustAnalysis,
} from "@/lib/vision/types";
import { logTokenUsage } from "@/lib/log-token-usage";
import {
  bindChatVehicleIdentity,
  bindConversationFocusToVehicle,
  loadOwnedGarageVehicle,
  resolveVehicleThreadIsolation,
  vehicleSelectionMismatch,
  VEHICLE_NOT_OWNED_CODE,
  VEHICLE_SELECTION_MISMATCH_CODE,
} from "@/lib/chat-vehicle-ownership";
import {
  capAuthoritativeHistory,
  clientTranscriptLooksTampered,
  extractCurrentUserMessage,
  loadAuthoritativeThreadMessages,
  persistAssistantMessage,
  persistUserMessage,
  resolveChatThread,
  shouldForceNewChatThread,
} from "@/lib/chat-history-authority";
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
      message: messageRaw,
      threadId: threadIdRaw,
      clientMessageId: clientMessageIdRaw,
      image,
      images,
      selectedVehicleId,
      playbookSlug,
      coachSlug,
      maintenanceSummary,
      conversationFocus: conversationFocusRaw,
      vehicleThreadReset: vehicleThreadResetRaw,
      vehicleChanged: vehicleChangedRaw,
      previousVehicleId: previousVehicleIdRaw,
    } = body as {
      /** @deprecated Ignored for model history (debug compare only). */
      messages?: DeepSeekMessage[];
      /** Current user turn only — required for server-authoritative history. */
      message?: string;
      /** Optional chat_threads id; must belong to user + this vehicle. */
      threadId?: string | null;
      /** Idempotent client id for the user turn. */
      clientMessageId?: string | null;
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
      /** True on the first Chat turn after selectedVehicleId changes. */
      vehicleThreadReset?: boolean;
      /** Alias for vehicleThreadReset (older / explicit client wording). */
      vehicleChanged?: boolean;
      /** Last vehicle_id that successfully opened a Chat API turn on this client. */
      previousVehicleId?: string | null;
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

    // Current user turn only — client messages[] is never model history.
    const content = extractCurrentUserMessage(messageRaw);
    if (!content.trim()) {
      return Response.json(
        {
          error: "message is required (server-authoritative history).",
          code: "MESSAGE_REQUIRED",
        },
        { status: 400 },
      );
    }
    if (
      process.env.NODE_ENV !== "production" &&
      clientTranscriptLooksTampered({ message: content, messages })
    ) {
      console.warn("[/api/chat] ignoring client messages[] transcript", {
        vehicleId: currentVehicle.id,
        clientTurns: Array.isArray(messages) ? messages.length : 0,
      });
    }

    // Vehicle switch: clear focus; resume that car's default/latest thread
    // (never close sibling topics — New topic keeps them for switch-back).
    const isolation = resolveVehicleThreadIsolation({
      vehicleThreadReset: vehicleThreadResetRaw,
      vehicleChanged: vehicleChangedRaw,
      previousVehicleId: previousVehicleIdRaw,
      currentVehicleId: currentVehicle.id,
      messages,
      currentVehicle,
    });
    const vehicleSwitched =
      isolation.reset ||
      shouldForceNewChatThread({
        vehicleThreadReset: vehicleThreadResetRaw === true,
        vehicleChanged: vehicleChangedRaw === true,
        previousVehicleId: previousVehicleIdRaw,
        currentVehicleId: currentVehicle.id,
      });
    const vehicleThreadReset = vehicleSwitched;
    if (vehicleThreadReset) {
      console.info("[/api/chat] vehicle-thread isolation", {
        reason: isolation.reason ?? "vehicle_switch",
        vehicleId: currentVehicle.id,
      });
    }

    const visionImages = [
      ...(Array.isArray(images) ? images : []),
      ...(image ? [image] : []),
    ].filter(Boolean);
    const uniqueImages = [...new Set(visionImages)].slice(
      0,
      CHAT_VISION_MAX_IMAGES,
    );

    let chatThreadId: string | null = null;
    let threadMessages: DeepSeekMessage[] = [];
    try {
      // On vehicle switch the client omits threadId → getOrCreate default for this car.
      const resolved = await resolveChatThread({
        client: userClient,
        userId: user.id,
        vehicleId: currentVehicle.id,
        threadId: vehicleSwitched
          ? null
          : typeof threadIdRaw === "string"
            ? threadIdRaw
            : null,
        forceNew: false,
      });
      chatThreadId = resolved.thread.id;

      // 1) Persist this user turn first (idempotent via clientMessageId).
      await persistUserMessage({
        client: userClient,
        userId: user.id,
        vehicleId: currentVehicle.id,
        threadId: resolved.thread.id,
        content,
        clientMessageId:
          typeof clientMessageIdRaw === "string" ? clientMessageIdRaw : null,
        image: uniqueImages[0] ?? null,
      });

      // 2) Assemble model history from DB only (includes the turn just written).
      const fromDb = await loadAuthoritativeThreadMessages({
        client: userClient,
        userId: user.id,
        threadId: resolved.thread.id,
        vehicleId: currentVehicle.id,
      });
      threadMessages = capAuthoritativeHistory(fromDb);
    } catch (err) {
      const status =
        err && typeof err === "object" && "status" in err
          ? Number((err as { status?: number }).status)
          : 0;
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code?: string }).code || "")
          : "";
      if (status === 403 || code.startsWith("THREAD_")) {
        return Response.json(
          {
            error:
              err instanceof Error
                ? err.message
                : "Chat thread is invalid for this vehicle.",
            code: code || "THREAD_FORBIDDEN",
          },
          { status: 403 },
        );
      }
      console.warn("[/api/chat] authoritative history unavailable", {
        message: err instanceof Error ? err.message : String(err),
      });
      return Response.json(
        {
          error:
            "Chat history service is unavailable. Refresh and try again.",
          code: "CHAT_HISTORY_UNAVAILABLE",
        },
        { status: 503 },
      );
    }

    if (!threadMessages.length) {
      return Response.json(
        { error: "Messages are required", code: "MESSAGE_REQUIRED" },
        { status: 400 },
      );
    }

    const conversationFocus = bindConversationFocusToVehicle(
      vehicleThreadReset
        ? {
            vehicleId: currentVehicle.id,
            previous: null,
            abandoned: null,
            apiHistoryFromId: null,
          }
        : conversationFocusRaw,
      currentVehicle.id,
    );

    await assertAiSpendGate(user.id, {
      needsVision: uniqueImages.length > 0,
      email: user.email,
    });

    let userMessages = [...threadMessages];

    let visionPrep: Awaited<ReturnType<typeof analyzeChatImage>> | null = null;
    if (uniqueImages[0]) {
      visionPrep = await analyzeChatImage(uniqueImages[0], content);
      if (visionPrep.billed) {
        await logTokenUsage({
          userId: user.id,
          route: "vision",
          provider: visionPrep.provider === "deepseek" ? "deepseek" : "kimi",
          model:
            visionPrep.model ||
            (visionPrep.provider === "deepseek"
              ? "deepseek-vision"
              : "kimi-k3"),
          promptTokens: visionPrep.usage?.prompt_tokens,
          completionTokens: visionPrep.usage?.completion_tokens,
          totalTokens: Math.max(
            1,
            visionPrep.usage?.total_tokens || 1,
          ),
          feature: "Chat photo",
          metadata: {
            kind: "chat_photo",
            requestId: visionPrep.requestId,
            perceptionProvider: visionPrep.provider,
            fallbackFrom: visionPrep.fallbackFrom,
          },
        });
      } else if (uniqueImages.length > 0) {
        console.warn("[/api/chat] chat photo perception unavailable", {
          requestId: visionPrep.requestId,
          failed: visionPrep.failed,
          disabled: visionPrep.disabled,
          fallbackFrom: visionPrep.fallbackFrom,
          elapsedMs: visionPrep.elapsedMs,
        });
      }
    }

    const visionDtcBlob = dtcTextFromAnalysis(visionPrep?.analysis ?? null);
    const lightingPhotoTurn =
      /\b(headlight|headlamp|low\s*beam|high\s*beam|dust\s*cap|sealed\s+led|housing)\b/i.test(
        content || "",
      ) || visionPrep?.analysis?.scene === "headlight_housing";
    const visionHousing = lightingPhotoTurn
      ? highConfidenceHousingAssist(visionPrep?.analysis ?? null)
      : null;
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

    const ragContextBase = ragService.formatKnowledgeForPrompt(ragHits, {
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
    // Private owner manual — strict user_id + vehicle_id (never global knowledge_base).
    let userManualHits: Awaited<
      ReturnType<
        typeof import("@/lib/vehicle-manuals").retrieveVehicleManualHits
      >
    > = [];
    let userManualBlock = "";
    try {
      const {
        retrieveVehicleManualHits,
        formatUserManualForPrompt,
      } = await import("@/lib/vehicle-manuals");
      userManualHits = await retrieveVehicleManualHits({
        client: userClient,
        userId: user.id,
        vehicleId: currentVehicle.id,
        query: ragQuery,
        limit: 4,
      });
      userManualBlock = formatUserManualForPrompt(userManualHits);
    } catch (err) {
      console.warn("[/api/chat] private manual retrieve skipped", {
        message: err instanceof Error ? err.message : String(err),
      });
    }
    const ragContext = [ragContextBase, userManualBlock]
      .filter((s) => s?.trim())
      .join("\n\n");
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

    // Never carry another vehicle's shop/maintenance narrative across a switch.
    const maintenanceCap = vehicleThreadReset
      ? null
      : typeof maintenanceSummary === "string"
        ? maintenanceSummary.length > 3_000
          ? `${maintenanceSummary.slice(0, 3_000)}\n…[truncated]`
          : maintenanceSummary
        : null;

    const userPlainForLang = latestUserPlainText(userMessages) || content;
    const replyLangHint = detectReplyLanguageHint(userPlainForLang);

    const recentUserTexts = userMessages
      .filter((m) => m.role === "user")
      .slice(-6)
      .map((m) => {
        if (typeof m.content === "string") return m.content;
        if (Array.isArray(m.content)) {
          return m.content
            .map((part) => {
              if (!part || typeof part !== "object") return "";
              const p = part as { type?: string; text?: string };
              return p.type === "text" && typeof p.text === "string"
                ? p.text
                : "";
            })
            .filter(Boolean)
            .join("\n");
        }
        return "";
      })
      .filter(Boolean);
    const transcriptBlob = recentUserTexts.join("\n");

    let factAnchors: string | null = null;
    try {
      factAnchors = await gatherVehicleFactAnchors(
        currentVehicle,
        textForFacts,
        { transcriptBlob, visionHousing },
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

    const identityPrompt = formatVehicleIdentityPrompt(
      currentVehicle,
      userPlainForLang,
    );
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

    // W8 intake / evidence / stop — ephemeral from transcript; after safety+drift, before messages.
    const intake = deriveIntake({
      currentUserMessage: userPlainForLang,
      recentUserTexts,
      visionHousing,
    });
    const w8Blocks = [
      formatIntakeStateBlock(intake),
      formatEvidenceBlock(intake.evidenceItems),
      formatStopRuleBlock(userPlainForLang),
    ].filter(Boolean);
    if (w8Blocks.length) {
      factAnchors = factAnchors
        ? `${factAnchors}\n\n${w8Blocks.join("\n\n")}`
        : w8Blocks.join("\n\n");
    }

    // Putco YMM fitment — read-only brand catalog; never overrides lighting structure gate.
    // At most one GET per turn; failures degrade without breaking Chat.
    if (shouldQueryPutco(userPlainForLang, { market: currentVehicle.market })) {
      try {
        const countryOrSkip = putcoCountryForMarket(currentVehicle.market);
        const putcoResult =
          countryOrSkip === "skip_eu_uk"
            ? {
                ok: false as const,
                reason: "eu_uk_catalog" as const,
                usCatalogOnlyNote: true,
              }
            : await fetchPutcoFitment({
                year: currentVehicle.year,
                make: currentVehicle.make,
                model: currentVehicle.model,
                country: countryOrSkip,
              });
        const structureUnconfirmed =
          intake.lightingIntent &&
          intake.slots.lighting_structure === "unknown";
        const putcoBlock = formatPutcoFitmentBlock(putcoResult, {
          structureUnconfirmed: Boolean(structureUnconfirmed),
        });
        if (putcoBlock) {
          factAnchors = factAnchors
            ? `${factAnchors}\n\n${putcoBlock}`
            : putcoBlock;
        }
      } catch {
        // Never fail the Chat turn on Putco errors.
      }
    }

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
      analysisProvider: visionPrep?.provider ?? undefined,
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

    const manualAllow = userManualHits.length
      ? (
          await import("@/lib/vehicle-manuals")
        ).extractManualSpecAllowlist(userManualHits)
      : {};
    const specCtx = {
      oilCapacity:
        currentVehicle.oilCapacity || manualAllow.oilCapacity || null,
      oilViscosity:
        currentVehicle.oilViscosity || manualAllow.oilViscosity || null,
      torqueSpec: manualAllow.torqueSpec || null,
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
          perceptionProvider: visionPrep?.provider ?? null,
          perceptionFallbackFrom: visionPrep?.fallbackFrom ?? null,
          perceptionFailed: Boolean(visionPrep?.failed),
          perceptionDisabled: Boolean(visionPrep?.disabled),
          ...specGapMetadata(classifySpecGapIntents(userPlainForLang)),
          ...safetyEventsMetadata(safetyEvents),
        },
      },
      "[/api/chat]",
    );

    const gatedContent = ensureDisclaimer(
      applyObdHonestyGuards(
        applyW10OutputGuards(
          applyW9OutputGuards(
            applyDiagnosticToneGuards(
              applySpecOutputGate(
                applyAffiliatePartsToReply(reply, prioritized, currentVehicle),
                specCtx,
              ),
            ),
            {
              userText: userPlainForLang,
              lightingStructureUnknown:
                intake.lightingIntent &&
                intake.slots.lighting_structure === "unknown",
              overheatIntent: intake.overheatIntent,
              steamReported: intake.slots.steam === "yes",
              batteryIntent: intake.batteryIntent,
            },
          ),
          {
            userText: userPlainForLang,
            brakeIntent: intake.brakeIntent,
            brakeStopDrive: intake.brakeStopDrive,
            lightingStructureUnknown:
              intake.lightingIntent &&
              intake.slots.lighting_structure === "unknown",
            housingPhotoLowTrust: Boolean(
              visionPrep?.analysis &&
                (isLowTrustAnalysis(visionPrep.analysis) ||
                  visionPrep.analysis.housing_confidence === "low" ||
                  visionPrep.analysis.housing_guess === "unclear"),
            ),
          },
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

    if (chatThreadId) {
      try {
        await persistAssistantMessage({
          client: userClient,
          userId: user.id,
          vehicleId: currentVehicle.id,
          threadId: chatThreadId,
          content: finalContent,
          provider: pipelineModel ? "deepseek" : null,
          model: pipelineModel || null,
        });
      } catch (persistErr) {
        console.warn("[/api/chat] persist assistant failed", {
          message:
            persistErr instanceof Error
              ? persistErr.message
              : String(persistErr),
          threadId: chatThreadId,
        });
      }
    }

    return Response.json({
      content: finalContent,
      threadId: chatThreadId,
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
