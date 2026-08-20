import { NextRequest } from "next/server";
import {
  callDeepSeek,
  estimateTokensFromMessages,
  normalizeImageUrl,
  trimDeepSeekConversation,
  type DeepSeekMessage,
} from "@/lib/deepseek";
import { ensureLegalDisclaimer } from "@/lib/legal-disclaimer";
import { applyInsuranceSafetyGuards } from "@/lib/insurance-coverage-rewrite";
import type { VehicleInfo } from "@/lib/types/chat";
import { buildChatSystemPrompt } from "@/lib/chat-system-prompt";
import {
  detectReplyLanguageHint,
  latestUserPlainText,
  turnReplyLanguageLock,
} from "@/lib/reply-language";
import { createSupabaseUserClient, createSupabaseAdmin } from "@/lib/supabase-admin";
import { tokenService } from "@/lib/token-service";
import {
  AI_ROUTE_TOKEN_FLOOR,
  aiAbuseResponse,
  assertAiRateLimit,
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
import { parseObdAdapterPreference } from "@/lib/obd-preference";
import {
  assistantContinuesStaleFocus,
  formatStaleFocusRepairPrompt,
  logChatDrift,
  matchedStalePhrases,
  parseTurnFocus,
  prepareDriftForChatTurn,
} from "@/lib/chat-intent-drift";
import { observeChatSafetyTurn } from "@/lib/pilot/observe-chat-safety";
import type { TurnFocus } from "@/lib/chat-intent-drift";

export const runtime = "nodejs";
/** Allow RAG + DeepSeek within Vercel serverless limits (no OpenAI fallback). */
export const maxDuration = 60;

/** Ensure AI reply includes liability disclaimer + insurance soft rewrite. */
function ensureDisclaimer(content: string, userPlainText?: string): string {
  const hint = detectReplyLanguageHint(userPlainText);
  return ensureLegalDisclaimer(applyInsuranceSafetyGuards(content), hint);
}

function getAccessToken(req: NextRequest): string | null {
  return getBearerToken(req);
}

/**
 * 将当前用户消息转为 Vision 多模态格式（文字 + 1..N 张 base64 图片）
 * 只处理最后一条与 content 匹配的用户消息，避免历史重复消息被误改
 */
function applyVisionToUserMessages(
  messages: DeepSeekMessage[],
  images: string[],
  content: string,
): DeepSeekMessage[] {
  const urls = images
    .filter(Boolean)
    .slice(0, 4)
    .map((img) => normalizeImageUrl(img));
  if (!urls.length) return messages;

  const userMessages = [...messages];

  for (let i = userMessages.length - 1; i >= 0; i--) {
    const msg = userMessages[i];
    if (msg.role !== "user" || typeof msg.content !== "string") continue;
    if (msg.content !== content) continue;

    userMessages[i] = {
      role: "user",
      content: [
        {
          type: "text",
          text:
            content ||
            "Analyze these vehicle photo(s). Describe visible clues, diagnose the likely issue, and emit a Focus Mode marker for the primary area.",
        },
        ...urls.map((url) => ({
          type: "image_url" as const,
          image_url: { url },
        })),
      ],
    };
    break;
  }

  return userMessages;
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
      currentVehicle,
      playbookSlug,
      coachSlug,
      maintenanceSummary,
      conversationFocus,
    } = body as {
      messages?: DeepSeekMessage[];
      /** @deprecated prefer `images` */
      image?: string;
      images?: string[];
      currentVehicle?: VehicleInfo;
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

    if (!currentVehicle?.make || !currentVehicle?.model) {
      return Response.json(
        { error: "Vehicle information is required" },
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
    const uniqueImages = [...new Set(visionImages)].slice(0, 4);

    let userMessages = [...messages];
    if (uniqueImages.length > 0) {
      userMessages = applyVisionToUserMessages(
        userMessages,
        uniqueImages,
        content,
      );
    }

    // ── RAG retrieval (plan depth → match limit) ─────────
    const ragLimit = await resolveRagLimit(user.id);
    const conflicts = detectConfigConflicts(currentVehicle, content);
    const conflictContext = formatConflictsForPrompt(conflicts);

    const ragQuery =
      content.trim().length < 24
        ? `${fitmentSearchString(currentVehicle)} ${content}`.trim()
        : content.trim() ||
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

    let { content: reply, usage } = await callDeepSeek(fullMessages);
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
    const shouldRepair =
      uniqueImages.length === 0 &&
      assistantContinuesStaleFocus(reply, abandonedFocus, drift.currentFocus);
    logChatDrift(
      {
        historySentToDeepSeek: userMessages.length,
        apiHistoryFromId: conversationFocus?.apiHistoryFromId ?? null,
        repairTriggered: shouldRepair,
        staleHits,
      },
      currentVehicle.id,
    );
    if (shouldRepair) {
      try {
        const repaired = await callDeepSeek(
          trimDeepSeekConversation(
            [
              ...fullMessages,
              {
                role: "system",
                content: formatStaleFocusRepairPrompt(drift, abandonedFocus),
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
    observeChatSafetyTurn({
      vehicleId: currentVehicle.id,
      userMessage: userPlainForLang,
      reply,
      currentFocus: drift.currentFocus,
    });
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
        promptTokens,
        completionTokens,
        playbookSlug: resolvedPlaybook,
        email: user.email,
        metadata: {
          make: currentVehicle.make,
          model: currentVehicle.model,
        },
      },
      "[/api/chat]",
    );

    const finalContent = ensureDisclaimer(
      applyAffiliatePartsToReply(reply, prioritized, currentVehicle),
      typeof content === "string" && content.trim()
        ? content
        : latestUserPlainText(fullMessages),
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
