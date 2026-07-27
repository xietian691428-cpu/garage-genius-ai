import { NextRequest } from "next/server";
import {
  callDeepSeek,
  estimateTokensFromMessages,
  normalizeImageUrl,
  type DeepSeekMessage,
} from "@/lib/deepseek";
import { DISCLAIMER } from "@/lib/constants";
import type { VehicleInfo } from "@/lib/types/chat";
import { buildChatSystemPrompt } from "@/lib/chat-system-prompt";
import { createSupabaseUserClient, createSupabaseAdmin } from "@/lib/supabase-admin";
import { tokenService } from "@/lib/token-service";
import {
  AI_ROUTE_TOKEN_FLOOR,
  aiAbuseResponse,
  assertAiRateLimit,
  assertAiTokenBudget,
  consumeAiTokens,
  getBearerToken,
} from "@/lib/ai-abuse";
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

export const runtime = "nodejs";

/** 确保 AI 回复包含免责声明（项目硬性要求） */
function ensureDisclaimer(content: string): string {
  const disclaimerSnippet = "Not professional mechanic advice";
  if (
    content.includes(disclaimerSnippet) ||
    content.includes(DISCLAIMER)
  ) {
    return content;
  }
  return `${content.trim()}\n\n${DISCLAIMER}`;
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

    // Anti-abuse: per-user hourly/daily request caps (before RAG / DeepSeek)
    await assertAiRateLimit(user.id, "chat");

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

    // DIY skill band (profiles.diy_skill) — tone + soft RAG ranking
    let diySkill = "beginner";
    try {
      const admin = createSupabaseAdmin();
      const { data: prof } = await admin
        .from("profiles")
        .select("diy_skill")
        .eq("id", user.id)
        .maybeSingle();
      diySkill = normalizeDiySkill(prof?.diy_skill);
    } catch {
      /* keep beginner */
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
      { diySkill },
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

    const affiliateCatalog = formatAffiliateCatalogForPrompt(prioritized);

    const fullMessages: DeepSeekMessage[] = [
      buildChatSystemPrompt(
        currentVehicle,
        uniqueImages.length > 0,
        ragContext,
        conflictContext,
        affiliateCatalog,
        typeof maintenanceSummary === "string" ? maintenanceSummary : null,
        diySkill,
      ),
      ...userMessages,
    ];

    const estimatedTokens = Math.max(
      AI_ROUTE_TOKEN_FLOOR.chat,
      estimateTokensFromMessages(fullMessages),
    );
    await assertAiTokenBudget(user.id, estimatedTokens);

    const { content: reply, usage } = await callDeepSeek(fullMessages);
    const actualTokensUsed = Math.max(1, usage.total_tokens);
    const resolvedPlaybook =
      (typeof playbookSlug === "string" && playbookSlug.trim()) ||
      (typeof coachSlug === "string" && coachSlug.trim()) ||
      null;

    try {
      await consumeAiTokens(user.id, actualTokensUsed, {
        route: "chat",
        model: "deepseek-chat",
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        playbookSlug: resolvedPlaybook,
        metadata: {
          make: currentVehicle.make,
          model: currentVehicle.model,
        },
      });
    } catch (consumeError) {
      console.error("[/api/chat] consumeTokens failed:", consumeError);
      return Response.json(
        {
          error:
            consumeError instanceof Error
              ? consumeError.message
              : "Token billing failed after AI reply. Please recharge or try again.",
          code: "TOKEN_CONSUME_FAILED",
        },
        { status: 402 },
      );
    }

    const finalContent = ensureDisclaimer(
      applyAffiliatePartsToReply(reply, prioritized),
    );
    const suggestedFocus = resolveFocusCommand(finalContent, ragHits);

    return Response.json({
      content: finalContent,
      usage: {
        prompt_tokens: usage.prompt_tokens,
        completion_tokens: usage.completion_tokens,
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
    });
  } catch (error: unknown) {
    const abuse = aiAbuseResponse(error);
    if (abuse) return abuse;

    console.error("[/api/chat]", error);

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
          ? "Token quota exceeded. Please upgrade or recharge."
          : isInsufficientBalance
            ? "DeepSeek account balance is insufficient. Please top up at platform.deepseek.com and try again."
            : "AI service is temporarily unavailable. Please try again.",
        code: isQuota ? "TOKEN_QUOTA_EXCEEDED" : undefined,
      },
      { status: isQuota || isInsufficientBalance ? 402 : 500 },
    );
  }
}
