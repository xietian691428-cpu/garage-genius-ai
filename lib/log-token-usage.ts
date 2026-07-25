/**
 * Per-call token ledger — fire after every successful LLM response.
 * Server-only (service role). Never import from client components.
 */

import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { estimateLlmCostUsd } from "@/lib/token-cost";
import type { AiRouteName } from "@/lib/ai-abuse";

export type LogTokenUsageInput = {
  userId: string;
  route: AiRouteName | "other";
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens: number;
  /** Coach playbook slug when the call was launched from a guide context */
  playbookSlug?: string | null;
  /** Human label for charts (defaults from route) */
  feature?: string | null;
  metadata?: Record<string, unknown>;
};

const ROUTE_FEATURE: Record<string, string> = {
  chat: "AI Chat Coach",
  vision: "Photo Diagnosis",
  inspect: "Dashboard Inspect",
  other: "Other LLM",
};

/**
 * Insert one row into token_usage_events.
 * Best-effort: never throws to the caller (billing already succeeded).
 */
export async function logTokenUsage(input: LogTokenUsageInput): Promise<void> {
  try {
    const prompt = Math.max(0, Math.floor(input.promptTokens ?? 0));
    const completion = Math.max(0, Math.floor(input.completionTokens ?? 0));
    let total = Math.max(0, Math.floor(input.totalTokens));
    if (total <= 0) total = Math.max(1, prompt + completion);

    const costUsd = estimateLlmCostUsd({
      promptTokens: prompt || Math.round(total * 0.7),
      completionTokens: completion || Math.max(0, total - Math.round(total * 0.7)),
    });

    const feature =
      input.feature?.trim() ||
      (input.playbookSlug
        ? `Playbook · ${input.playbookSlug}`
        : ROUTE_FEATURE[input.route] || ROUTE_FEATURE.other);

    const admin = createSupabaseAdmin();
    const { error } = await admin.from("token_usage_events").insert({
      user_id: input.userId,
      route: input.route,
      model: input.model ?? null,
      prompt_tokens: prompt,
      completion_tokens: completion,
      total_tokens: total,
      cost_usd: costUsd,
      playbook_slug: input.playbookSlug?.trim() || null,
      feature,
      metadata: input.metadata ?? {},
    });

    if (error) {
      console.warn("[logTokenUsage] insert failed:", error.message);
    }
  } catch (err) {
    console.warn(
      "[logTokenUsage]",
      err instanceof Error ? err.message : "unknown error",
    );
  }
}
