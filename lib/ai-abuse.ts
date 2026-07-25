/**
 * Anti-abuse for AI routes — rate limits + shared auth helper.
 * Token budgets still live in lib/token-service.ts (monthly quotas).
 *
 * Env (optional overrides):
 *   AI_MAX_REQUESTS_PER_HOUR
 *   AI_MAX_REQUESTS_PER_DAY
 */

import type { NextRequest } from "next/server";
import { createSupabaseAdmin, createSupabaseUserClient } from "@/lib/supabase-admin";
import { tokenService } from "@/lib/token-service";
import { isQaUnlockEnabled } from "@/lib/qa-mode";
import type { TokenPlan } from "@/lib/types/tokens";

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

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "AiAbuseError";
    this.status = status;
    this.code = code;
  }
}

/** Resolve signed-in user from Bearer JWT or throw 401. */
export async function requireAiUser(req: NextRequest): Promise<{
  id: string;
  email?: string | null;
}> {
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

  return { id: user.id, email: user.email };
}

/**
 * Count recent AI requests and reject if over plan/env caps.
 * Always inserts a log row when allowed (call before DeepSeek).
 */
export async function assertAiRateLimit(
  userId: string,
  route: AiRouteName,
): Promise<void> {
  if (isQaUnlockEnabled()) return;

  const plan = await tokenService.getUserPlan(userId);
  const limits = resolveRateLimits(plan);
  const admin = createSupabaseAdmin();
  const now = Date.now();
  const hourAgo = new Date(now - 60 * 60 * 1000).toISOString();
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();

  const [{ count: hourCount }, { count: dayCount }] = await Promise.all([
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

  if ((hourCount ?? 0) >= limits.perHour) {
    throw new AiAbuseError(
      `Too many AI requests this hour (limit ${limits.perHour} for ${plan}). Try again later.`,
      429,
      "rate_limit_hour",
    );
  }

  if ((dayCount ?? 0) >= limits.perDay) {
    throw new AiAbuseError(
      `Daily AI request limit reached (${limits.perDay} for ${plan}). Try again tomorrow or upgrade.`,
      429,
      "rate_limit_day",
    );
  }

  const { error } = await admin.from("ai_request_log").insert({
    user_id: userId,
    route,
  });

  // Table missing during rollout — fail open with log (don't block product)
  if (error) {
    console.warn("[ai-abuse] ai_request_log insert failed:", error.message);
  }
}

/**
 * Pre-check monthly token budget before calling the model.
 * `estimated` should be max(floor, estimateTokensFromMessages(...)).
 */
export async function assertAiTokenBudget(
  userId: string,
  estimatedTokens: number,
): Promise<void> {
  if (isQaUnlockEnabled()) return;

  const needed = Math.max(1, Math.ceil(estimatedTokens));
  const ok = await tokenService.hasEnoughTokens(userId, needed);
  if (!ok) {
    const availability = await tokenService.getAvailableTokens(userId);
    throw new AiAbuseError(
      `Insufficient tokens. Remaining this month: ${availability.remainingThisMonth}. Plan: ${availability.plan}.`,
      402,
      "insufficient_tokens",
    );
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
  },
): Promise<void> {
  if (isQaUnlockEnabled()) {
    // Still record usage for admin visibility during QA unlock.
    if (options?.route) {
      const { logTokenUsage } = await import("@/lib/log-token-usage");
      await logTokenUsage({
        userId,
        route: options.route,
        model: options.model,
        promptTokens: options.promptTokens,
        completionTokens: options.completionTokens,
        totalTokens: Math.max(1, Math.ceil(actualTokens)),
        playbookSlug: options.playbookSlug,
        feature: options.feature,
        metadata: { ...(options.metadata || {}), qa_unlock: true },
      });
    }
    return;
  }

  const used = Math.max(1, Math.ceil(actualTokens));
  await tokenService.consumeTokens(userId, used);

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
      promptTokens: options.promptTokens,
      completionTokens: options.completionTokens,
      totalTokens: used,
      playbookSlug: options.playbookSlug,
      feature: options.feature,
      metadata: options.metadata,
    });
  }
}

export function aiAbuseResponse(err: unknown): Response | null {
  if (!(err instanceof AiAbuseError)) return null;
  return Response.json(
    { error: err.message, code: err.code },
    { status: err.status },
  );
}
