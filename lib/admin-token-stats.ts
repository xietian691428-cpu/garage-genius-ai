/**
 * Admin token usage aggregations (service role).
 */

import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { getTokenCostRates } from "@/lib/token-cost";
import { aiCostRateSummary } from "@/lib/ai-cost/prices";
import {
  getAdminAiMarginMonth,
  type AiMarginMonth,
} from "@/lib/admin-ai-margin";
import {
  aggregateSpecGapStats,
  emptySpecGapStats,
  parseSpecGapTags,
  type SpecGapStats,
} from "@/lib/spec-gap-intent";
import {
  aggregateSafetyObserveStats,
  type SafetyObserveCounts,
} from "@/lib/safety-observe-events";

export type TokenStatsRange = "day" | "week" | "month";

export type TokenTrendPoint = {
  date: string;
  tokens: number;
  costUsd: number;
  calls: number;
};

export type TokenRouteBreakdown = {
  route: string;
  feature: string;
  tokens: number;
  costUsd: number;
  calls: number;
};

export type TokenPlaybookBreakdown = {
  playbookSlug: string;
  tokens: number;
  costUsd: number;
  calls: number;
};

export type TokenStatsResponse = {
  range: TokenStatsRange;
  since: string;
  until: string;
  summary: {
    totalTokens: number;
    promptTokens: number;
    completionTokens: number;
    totalCostUsd: number;
    totalCalls: number;
    uniqueUsers: number;
    avgTokensPerCall: number;
  };
  costRates: ReturnType<typeof getTokenCostRates>;
  aiRates: ReturnType<typeof aiCostRateSummary>;
  marginMonth: AiMarginMonth | null;
  trend: TokenTrendPoint[];
  byRoute: TokenRouteBreakdown[];
  topPlaybooks: TokenPlaybookBreakdown[];
  recent: Array<{
    id: string;
    createdAt: string;
    route: string;
    feature: string | null;
    playbookSlug: string | null;
    model: string | null;
    totalTokens: number;
    costUsd: number;
    userId: string | null;
  }>;
  /** Chat turns tagged oil/interval/torque — tags only, no message text. */
  specGap: SpecGapStats;
  /** Compact safety/cost observe names on Chat/vision rows — no VIN. */
  safetyObserve: { counts: SafetyObserveCounts; taggedCalls: number };
};

function rangeStart(range: TokenStatsRange, now = new Date()): Date {
  const d = new Date(now);
  if (range === "day") {
    d.setHours(d.getHours() - 24);
  } else if (range === "week") {
    d.setDate(d.getDate() - 7);
  } else {
    d.setDate(d.getDate() - 30);
  }
  return d;
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

type EventRow = {
  id: string;
  user_id: string | null;
  route: string;
  model: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_usd: number | string;
  playbook_slug: string | null;
  feature: string | null;
  created_at: string;
  metadata?: Record<string, unknown> | null;
};

export async function getAdminTokenStats(
  range: TokenStatsRange = "week",
): Promise<TokenStatsResponse> {
  const until = new Date();
  const since = rangeStart(range, until);
  const admin = createSupabaseAdmin();

  const [eventsRes, marginMonth] = await Promise.all([
    admin
      .from("token_usage_events")
      .select(
        "id, user_id, route, model, prompt_tokens, completion_tokens, total_tokens, cost_usd, playbook_slug, feature, created_at, metadata",
      )
      .gte("created_at", since.toISOString())
      .lte("created_at", until.toISOString())
      .order("created_at", { ascending: true })
      .limit(20_000),
    getAdminAiMarginMonth().catch((err) => {
      console.warn(
        "[admin-token-stats] margin month",
        err instanceof Error ? err.message : err,
      );
      return null;
    }),
  ]);

  const { data, error } = eventsRes;

  if (error) {
    // Table missing before migration — return empty shell
    if (/token_usage_events|does not exist|schema cache/i.test(error.message)) {
      return emptyStats(range, since, until, marginMonth);
    }
    throw error;
  }

  const rows = (data as EventRow[]) || [];
  const users = new Set<string>();
  let totalTokens = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let totalCostUsd = 0;

  const trendMap = new Map<string, TokenTrendPoint>();
  const routeMap = new Map<string, TokenRouteBreakdown>();
  const playbookMap = new Map<string, TokenPlaybookBreakdown>();

  for (const row of rows) {
    const tokens = Number(row.total_tokens) || 0;
    const cost = Number(row.cost_usd) || 0;
    const prompt = Number(row.prompt_tokens) || 0;
    const completion = Number(row.completion_tokens) || 0;

    totalTokens += tokens;
    promptTokens += prompt;
    completionTokens += completion;
    totalCostUsd += cost;
    if (row.user_id) users.add(row.user_id);

    const key = dayKey(row.created_at);
    const trend = trendMap.get(key) || {
      date: key,
      tokens: 0,
      costUsd: 0,
      calls: 0,
    };
    trend.tokens += tokens;
    trend.costUsd += cost;
    trend.calls += 1;
    trendMap.set(key, trend);

    const routeKey = row.route || "other";
    const route = routeMap.get(routeKey) || {
      route: routeKey,
      feature: row.feature || routeKey,
      tokens: 0,
      costUsd: 0,
      calls: 0,
    };
    route.tokens += tokens;
    route.costUsd += cost;
    route.calls += 1;
    if (row.feature) route.feature = row.feature;
    routeMap.set(routeKey, route);

    if (row.playbook_slug) {
      const pb = playbookMap.get(row.playbook_slug) || {
        playbookSlug: row.playbook_slug,
        tokens: 0,
        costUsd: 0,
        calls: 0,
      };
      pb.tokens += tokens;
      pb.costUsd += cost;
      pb.calls += 1;
      playbookMap.set(row.playbook_slug, pb);
    }
  }

  // Fill missing days so the chart is continuous
  const trend: TokenTrendPoint[] = [];
  const cursor = new Date(since);
  cursor.setUTCHours(0, 0, 0, 0);
  const end = new Date(until);
  end.setUTCHours(0, 0, 0, 0);
  while (cursor <= end) {
    const key = cursor.toISOString().slice(0, 10);
    const hit = trendMap.get(key);
    trend.push(
      hit || { date: key, tokens: 0, costUsd: 0, calls: 0 },
    );
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const byRoute = [...routeMap.values()].sort((a, b) => b.tokens - a.tokens);
  const topPlaybooks = [...playbookMap.values()]
    .sort((a, b) => b.tokens - a.tokens)
    .slice(0, 10);

  // If no playbook tags yet, surface routes as "top playbooks" stand-in for the table
  const playbooksOrRoutes: TokenPlaybookBreakdown[] =
    topPlaybooks.length > 0
      ? topPlaybooks
      : byRoute.slice(0, 10).map((r) => ({
          playbookSlug: r.feature || r.route,
          tokens: r.tokens,
          costUsd: r.costUsd,
          calls: r.calls,
        }));

  const recent = [...rows]
    .reverse()
    .slice(0, 40)
    .map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      route: row.route,
      feature: row.feature,
      playbookSlug: row.playbook_slug,
      model: row.model,
      totalTokens: Number(row.total_tokens) || 0,
      costUsd: Number(row.cost_usd) || 0,
      userId: row.user_id,
    }));

  return {
    range,
    since: since.toISOString(),
    until: until.toISOString(),
    summary: {
      totalTokens,
      promptTokens,
      completionTokens,
      totalCostUsd: Math.round(totalCostUsd * 1_000_000) / 1_000_000,
      totalCalls: rows.length,
      uniqueUsers: users.size,
      avgTokensPerCall:
        rows.length > 0 ? Math.round(totalTokens / rows.length) : 0,
    },
    costRates: getTokenCostRates(),
    aiRates: aiCostRateSummary(),
    marginMonth,
    trend: trend.map((t) => ({
      ...t,
      costUsd: Math.round(t.costUsd * 1_000_000) / 1_000_000,
    })),
    byRoute: byRoute.map((r) => ({
      ...r,
      costUsd: Math.round(r.costUsd * 1_000_000) / 1_000_000,
    })),
    topPlaybooks: playbooksOrRoutes.map((p) => ({
      ...p,
      costUsd: Math.round(p.costUsd * 1_000_000) / 1_000_000,
    })),
    recent,
    specGap: aggregateSpecGapStats(
      rows
        .filter((row) => row.route === "chat")
        .map((row) => ({
          tags: parseSpecGapTags(row.metadata?.spec_gap),
        })),
    ),
    safetyObserve: aggregateSafetyObserveStats(
      rows.map((row) => ({
        events: row.metadata?.safetyEvents,
      })),
    ),
  };
}

function emptyStats(
  range: TokenStatsRange,
  since: Date,
  until: Date,
  marginMonth: AiMarginMonth | null = null,
): TokenStatsResponse {
  return {
    range,
    since: since.toISOString(),
    until: until.toISOString(),
    summary: {
      totalTokens: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalCostUsd: 0,
      totalCalls: 0,
      uniqueUsers: 0,
      avgTokensPerCall: 0,
    },
    costRates: getTokenCostRates(),
    aiRates: aiCostRateSummary(),
    marginMonth,
    trend: [],
    byRoute: [],
    topPlaybooks: [],
    recent: [],
    specGap: emptySpecGapStats(),
    safetyObserve: { counts: {}, taggedCalls: 0 },
  };
}
