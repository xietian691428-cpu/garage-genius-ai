/**
 * Anti-abuse for AI routes — rate limits + shared auth helper.
 * Token budgets still live in lib/token-service.ts (monthly quotas).
 *
 * Env (optional overrides):
 *   AI_MAX_REQUESTS_PER_HOUR
 *   AI_MAX_REQUESTS_PER_DAY
 */

import type { NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createSupabaseAdmin, createSupabaseUserClient } from "@/lib/supabase-admin";
import { tokenService } from "@/lib/token-service";
import { isQaUnlockEnabled } from "@/lib/qa-mode";
import {
  isUnlimitedTokenUser,
  shouldBypassAiMetering,
} from "@/lib/test-token-bypass";
import type { TokenPlan } from "@/lib/types/tokens";
import {
  isEmailVerificationRequired,
  isUserEmailVerified,
} from "@/lib/email-verification";
import { isAiCostHardCapEnabled } from "@/lib/ai-cost/config";
import { evaluateAiSpendGate } from "@/lib/ai-cost/gate";
import { getAiSpendSnapshot } from "@/lib/ai-cost/meter";
import { logSafetyObserveEvent } from "@/lib/safety-observe-events";

export type AiRouteName = "chat" | "vision" | "inspect";

/** Default per-plan request caps (provider-spend protection). */
export const AI_RATE_LIMITS: Record<
  TokenPlan,
  { perHour: number; perDay: number }
> = {
  free: { perHour: 20, perDay: 60 },
  pro: { perHour: 60, perDay: 300 },
  pro_heavy: { perHour: 120, perDay: 800 },
};

/** Minimum tokens to reserve before calling the model (pre-check floor). */
export const AI_ROUTE_TOKEN_FLOOR: Record<AiRouteName, number> = {
  chat: 800,
  vision: 2_000,
  inspect: 1_500,
};

function envInt(name: string): number | null {
  const raw = process.env[name]?.trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

export function resolveRateLimits(plan: TokenPlan): {
  perHour: number;
  perDay: number;
} {
  const base = AI_RATE_LIMITS[plan];
  return {
    perHour: envInt("AI_MAX_REQUESTS_PER_HOUR") ?? base.perHour,
    perDay: envInt("AI_MAX_REQUESTS_PER_DAY") ?? base.perDay,
  };
}

export function getBearerToken(req: NextRequest): string | null {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim() || null;
}

export class AiAbuseError extends Error {
  status: number;
  code: string;
  payload?: Record<string, unknown>;

  constructor(
    message: string,
    status: number,
    code: string,
    payload?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AiAbuseError";
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}

/** Resolve signed-in user from Bearer JWT or throw 401. */
export async function requireAiUser(req: NextRequest): Promise<User> {
  const accessToken = getBearerToken(req);
  if (!accessToken) {
    throw new AiAbuseError(
      "Sign in required to use AI (quota + abuse protection).",
      401,
      "unauthorized",
    );
  }

  const userClient = createSupabaseUserClient(accessToken);
  const {
    data: { user },
    error,
  } = await userClient.auth.getUser();

  if (error || !user) {
    throw new AiAbuseError(
      "Invalid or expired session. Please sign in again.",
      401,
      "unauthorized",
    );
  }

  return user;
}

/** Require verified email for gated product features. */
export function assertEmailVerified(user: User): void {
  if (!isEmailVerificationRequired()) return;
  if (isUserEmailVerified(user)) return;
  throw new AiAbuseError(
    "Verify your email to use this feature. Check your inbox or resend the confirmation link from Settings.",
    403,
    "email_unverified",
  );
}

/** Resolve signed-in user + require verified email. */
export async function requireVerifiedAiUser(req: NextRequest): Promise<User> {
  const user = await requireAiUser(req);
  assertEmailVerified(user);
  return user;
}

/**
 * Guideline 5.1.1 — block DeepSeek until the user consents in-app.
 * Missing column (pre-migration) fails open with a warning so deploys aren't bricked.
 */
export async function assertAiProviderConsent(userId: string): Promise<void> {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("profiles")
    .select("has_acknowledged_ai_consent")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    if (
      /has_acknowledged_ai_consent|does not exist|schema cache/i.test(
        error.message,
      )
    ) {
      console.warn(
        "[ai-consent] column missing — apply migration 050_apple_iap_and_ai_consent.sql",
      );
      return;
    }
    throw new AiAbuseError(
      "Could not verify AI consent. Please try again.",
      503,
      "ai_consent_unavailable",
    );
  }

  if (data?.has_acknowledged_ai_consent !== true) {
    throw new AiAbuseError(
      "Please agree to AI processing (DeepSeek for chat, Kimi for photos) before using this feature.",
      403,
      "ai_consent_required",
    );
  }
}

/**
 * Count recent AI requests and reject if over plan/env caps.
 * Always inserts a log row when allowed (call before DeepSeek).
 * Fail-closed: DB errors reject the request.
 */
export async function assertAiRateLimit(
  userId: string,
  route: AiRouteName,
  email?: string | null,
): Promise<void> {
  await assertAiProviderConsent(userId);

  if (shouldBypassAiMetering({ email, qaUnlock: isQaUnlockEnabled() })) return;
  if (await isUnlimitedTokenUser(userId, email)) return;

  const plan = await tokenService.getUserPlan(userId);
  const limits = resolveRateLimits(plan);
  const admin = createSupabaseAdmin();
  const now = Date.now();
  const hourAgo = new Date(now - 60 * 60 * 1000).toISOString();
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();

  const [hourRes, dayRes] = await Promise.all([
    admin
      .from("ai_request_log")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", hourAgo),
    admin
      .from("ai_request_log")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", dayAgo),
  ]);

  if (hourRes.error || dayRes.error) {
    console.error(
      "[ai-abuse] rate-limit query failed:",
      hourRes.error?.message || dayRes.error?.message,
    );
    throw new AiAbuseError(
      "Security check unavailable. Please try again in a moment.",
      503,
      "rate_limit_unavailable",
    );
  }

  if ((hourRes.count ?? 0) >= limits.perHour) {
    throw new AiAbuseError(
      `Too many AI requests this hour (limit ${limits.perHour} for ${plan}). Try again later.`,
      429,
      "rate_limit_hour",
    );
  }

  if ((dayRes.count ?? 0) >= limits.perDay) {
    throw new AiAbuseError(
      `Daily AI request limit reached (${limits.perDay} for ${plan}). Try again tomorrow.`,
      429,
      "rate_limit_day",
    );
  }

  const { error } = await admin.from("ai_request_log").insert({
    user_id: userId,
    route,
  });

  if (error) {
    console.error("[ai-abuse] ai_request_log insert failed:", error.message);
    throw new AiAbuseError(
      "Could not record this request for abuse protection. Please try again shortly.",
      503,
      "rate_limit_unavailable",
    );
  }
}

/**
 * Pre-check monthly token budget before calling the model.
 * `estimated` should be max(floor, estimateTokensFromMessages(...)).
 */
export async function assertAiTokenBudget(
  userId: string,
  estimatedTokens: number,
  email?: string | null,
): Promise<void> {
  if (shouldBypassAiMetering({ email, qaUnlock: isQaUnlockEnabled() })) return;
  if (await isUnlimitedTokenUser(userId, email)) return;

  const needed = Math.max(1, Math.ceil(estimatedTokens));
  const ok = await tokenService.hasEnoughTokens(userId, needed, email);
  if (!ok) {
    const availability = await tokenService.getAvailableTokens(userId, email);
    throw new AiAbuseError(
      `Insufficient tokens. Remaining this month: ${availability.remainingThisMonth}. Plan: ${availability.plan}.`,
      402,
      "insufficient_tokens",
    );
  }
}

/**
 * UTC-month USD budget + vision call cap. No-op when AI_COST_HARD_CAP=0.
 * Call before Kimi/DeepSeek. Does not change Coach playbook logic.
 */
export async function assertAiSpendGate(
  userId: string,
  options: { needsVision?: boolean; email?: string | null } = {},
): Promise<void> {
  if (!isAiCostHardCapEnabled()) return;
  if (
    shouldBypassAiMetering({
      email: options.email,
      qaUnlock: isQaUnlockEnabled(),
    })
  ) {
    return;
  }
  if (await isUnlimitedTokenUser(userId, options.email)) return;

  let snapshot;
  try {
    snapshot = await getAiSpendSnapshot(userId, options.email);
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code?: string }).code)
        : "";
    const status =
      err && typeof err === "object" && "status" in err
        ? Number((err as { status?: number }).status)
        : 503;
    throw new AiAbuseError(
      err instanceof Error
        ? err.message
        : "Could not verify AI usage allowance. Please try again in a moment.",
      status === 503 ? 503 : 503,
      code || "ai_spend_unavailable",
    );
  }

  const decision = evaluateAiSpendGate({
    plan: snapshot.plan,
    spentUsd: snapshot.spentUsd,
    visionUsed: snapshot.visionUsed,
    needsVision: Boolean(options.needsVision),
  });

  if (!decision.ok) {
    logSafetyObserveEvent(
      decision.code,
      { status: decision.status, limited: true },
      { userId },
    );
    throw new AiAbuseError(decision.message, decision.status, decision.code, {
      limited: true,
      remaining: decision.remaining,
      used: decision.used,
      limit: decision.limit,
    });
  }
}

/** Deduct after a successful model call. Throws on failure (do not swallow). */
export async function consumeAiTokens(
  userId: string,
  actualTokens: number,
  options?: {
    route?: AiRouteName | "other";
    model?: string;
    promptTokens?: number;
    completionTokens?: number;
    playbookSlug?: string | null;
    feature?: string | null;
    metadata?: Record<string, unknown>;
    email?: string | null;
    /** deepseek | kimi — used to stamp cost_usd */
    provider?: "deepseek" | "kimi" | "other";
    /**
     * Kimi vision tokens must not eat the monthly text quota.
     * Still writes token_usage_events for cost accounting.
     */
    skipMonthlyQuota?: boolean;
  },
): Promise<void> {
  const unlimitedTester = await isUnlimitedTokenUser(
    userId,
    options?.email,
  );

  const shouldSkipQuota =
    Boolean(options?.skipMonthlyQuota) ||
    isQaUnlockEnabled() ||
    unlimitedTester;

  if (shouldSkipQuota) {
    // Still record usage for admin cost vs revenue.
    if (options?.route) {
      const { logTokenUsage } = await import("@/lib/log-token-usage");
      await logTokenUsage({
        userId,
        route: options.route,
        model: options.model,
        provider: options.provider,
        promptTokens: options.promptTokens,
        completionTokens: options.completionTokens,
        totalTokens: Math.max(1, Math.ceil(actualTokens)),
        playbookSlug: options.playbookSlug,
        feature: options.feature,
        metadata: {
          ...(options.metadata || {}),
          ...(options.skipMonthlyQuota ? { skip_monthly_quota: true } : {}),
          ...(isQaUnlockEnabled() ? { qa_unlock: true } : {}),
          ...(unlimitedTester ? { test_unlimited_tokens: true } : {}),
        },
      });
    }
    return;
  }

  const used = Math.max(1, Math.ceil(actualTokens));
  await tokenService.consumeTokens(userId, used, options?.email);

  // Best-effort: stamp last log row with tokens_used
  try {
    const admin = createSupabaseAdmin();
    const { data: latest } = await admin
      .from("ai_request_log")
      .select("id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latest?.id) {
      await admin
        .from("ai_request_log")
        .update({ tokens_used: used })
        .eq("id", latest.id);
    }
  } catch {
    /* ignore */
  }

  if (options?.route) {
    const { logTokenUsage } = await import("@/lib/log-token-usage");
    await logTokenUsage({
      userId,
      route: options.route,
      model: options.model,
      provider: options.provider,
      promptTokens: options.promptTokens,
      completionTokens: options.completionTokens,
      totalTokens: used,
      playbookSlug: options.playbookSlug,
      feature: options.feature,
      metadata: options.metadata,
    });
  }
}

/**
 * Deduct after a successful LLM call without turning a billing glitch into a 402.
 * Failed requests never reach here (pre-check is assertAiTokenBudget).
 */
export async function consumeAiTokensBestEffort(
  userId: string,
  actualTokens: number,
  options?: Parameters<typeof consumeAiTokens>[2],
  logLabel = "[ai-abuse]",
): Promise<void> {
  try {
    await consumeAiTokens(userId, actualTokens, options);
  } catch (err) {
    console.error(`${logLabel} consumeTokens failed:`, err);
  }
}

export function aiAbuseResponse(err: unknown): Response | null {
  if (!(err instanceof AiAbuseError)) return null;
  return Response.json(
    {
      error: err.message,
      code: err.code,
      ...(err.payload || {}),
    },
    { status: err.status },
  );
}
