/**
 * Remote safety-topic overrides (P1 skeleton).
 *
 * Intended flow (not fully wired yet):
 * 1. Admin edits reviewed rows in Supabase (or a signed config JSON).
 * 2. Client fetches on Chat enter / app start, caches ~24h.
 * 3. On failure → DEFAULT_SAFETY_TOPICS only (never block Chat).
 * 4. Kill-switch: enabled=false on a topic disables it without redeploy.
 *
 * IMPORTANT:
 * - Do NOT auto-pipe NHTSA / recall / regulator prose into callouts.
 * - Every remote callout change needs human review before enable.
 * - Keep a path to clear cache / disable remote (SAFETY_TOPICS_REMOTE_ENABLED).
 */

import {
  DEFAULT_SAFETY_TOPICS,
  mergeSafetyTopics,
  type SafetyTopic,
} from "@/lib/safety-topics";

const CACHE_KEY = "garageGenius_safety_topics_remote_v1";
export const SAFETY_TOPICS_REMOTE_CACHE_MS = 24 * 60 * 60 * 1000;

/**
 * Feature flag — leave false until Admin UI + migration exist.
 * Set true (e.g. env NEXT_PUBLIC_SAFETY_TOPICS_REMOTE=1) to attempt fetch.
 */
export function isSafetyTopicsRemoteEnabled(): boolean {
  if (typeof process !== "undefined") {
    return process.env.NEXT_PUBLIC_SAFETY_TOPICS_REMOTE === "1";
  }
  return false;
}

type RemoteCachePayload = {
  fetchedAt: number;
  topics: SafetyTopic[];
};

let memoryOverride: SafetyTopic[] | null = null;
let memoryFetchedAt = 0;

function readCache(): RemoteCachePayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RemoteCachePayload;
    if (!parsed || !Array.isArray(parsed.topics)) return null;
    if (typeof parsed.fetchedAt !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(payload: RemoteCachePayload): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

/** Clear remote cache (rollback / kill-switch helper). */
export function clearSafetyTopicsRemoteCache(): void {
  memoryOverride = null;
  memoryFetchedAt = 0;
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Active catalog = local defaults ⊕ remote overlay (if any).
 * Sync — safe for MessageBubble render path.
 */
export function getActiveSafetyTopics(): SafetyTopic[] {
  const cached = memoryOverride ?? readCache()?.topics ?? null;
  if (cached?.length) {
    if (!memoryOverride) {
      memoryOverride = cached;
      memoryFetchedAt = readCache()?.fetchedAt ?? Date.now();
    }
    return mergeSafetyTopics(DEFAULT_SAFETY_TOPICS, cached);
  }
  return mergeSafetyTopics(DEFAULT_SAFETY_TOPICS, null);
}

/**
 * Fetch remote overrides when enabled. No-op / local-only when disabled or failed.
 *
 * TODO(P1): Replace stub with:
 *   supabase.from('safety_topic_overrides')
 *     .select('topic_id, severity, keywords, keywords_zh, keywords_es, callout_en, callout_zh, callout_es, enabled, updated_at')
 *     .eq('enabled', true)
 *   — or GET /api/safety-topics (Admin-audited JSON).
 */
export async function ensureSafetyTopicsRemote(options?: {
  force?: boolean;
}): Promise<{ source: "local" | "remote" | "cache"; count: number }> {
  if (!isSafetyTopicsRemoteEnabled()) {
    return {
      source: "local",
      count: DEFAULT_SAFETY_TOPICS.length,
    };
  }

  const now = Date.now();
  const cached = readCache();
  if (
    !options?.force &&
    cached &&
    now - cached.fetchedAt < SAFETY_TOPICS_REMOTE_CACHE_MS
  ) {
    memoryOverride = cached.topics;
    memoryFetchedAt = cached.fetchedAt;
    return { source: "cache", count: cached.topics.length };
  }

  try {
    // TODO(P1): implement fetchSafetyTopicOverrides() against Admin-audited source.
    const remote = await fetchSafetyTopicOverridesStub();
    if (!remote?.length) {
      return {
        source: memoryOverride ? "cache" : "local",
        count: getActiveSafetyTopics().length,
      };
    }
    memoryOverride = remote;
    memoryFetchedAt = now;
    writeCache({ fetchedAt: now, topics: remote });
    return { source: "remote", count: remote.length };
  } catch (err) {
    console.warn("[safety-topics-remote] fetch failed — using local", err);
    return {
      source: memoryFetchedAt ? "cache" : "local",
      count: getActiveSafetyTopics().length,
    };
  }
}

/** Placeholder until Supabase /api/safety-topics is wired. Always null today. */
async function fetchSafetyTopicOverridesStub(): Promise<SafetyTopic[] | null> {
  return null;
}

/** Test helper — inject overlay without network. */
export function __setSafetyTopicsRemoteForTests(
  topics: SafetyTopic[] | null,
): void {
  memoryOverride = topics;
  memoryFetchedAt = topics ? Date.now() : 0;
}
