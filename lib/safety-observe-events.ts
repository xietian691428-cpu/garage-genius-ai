/**
 * Compact production safety/cost observe events.
 * Never log full VIN, emails, base64 images, or prompt/message bodies.
 *
 * Grep: `[safety-observe]`
 * Admin: token_usage_events.metadata.safetyEvents (event names only).
 */

import { createHash } from "crypto";
import { isChatDriftDebugEnabled } from "@/lib/chat-intent-drift";

export const SAFETY_OBSERVE_EVENTS = [
  "drift_reset",
  "spec_block",
  "vision_reject",
  "recall_degraded",
  "ai_budget_exceeded",
  "vision_quota_exceeded",
  "exit_under_repair",
] as const;

export type SafetyObserveEvent = (typeof SAFETY_OBSERVE_EVENTS)[number];

const EVENT_SET = new Set<string>(SAFETY_OBSERVE_EVENTS);

const DROP_KEYS = new Set([
  "prompt",
  "prompts",
  "messages",
  "content",
  "image",
  "images",
  "email",
  "vin",
  "authorization",
  "body",
  "access_token",
  "password",
]);

export function isSafetyObserveEvent(
  value: unknown,
): value is SafetyObserveEvent {
  return typeof value === "string" && EVENT_SET.has(value);
}

export function parseSafetyObserveEvents(raw: unknown): SafetyObserveEvent[] {
  if (!Array.isArray(raw)) return [];
  const out: SafetyObserveEvent[] = [];
  for (const item of raw) {
    if (isSafetyObserveEvent(item) && !out.includes(item)) out.push(item);
  }
  return out;
}

/** First 12 hex of sha256 — optional, never the raw user id. */
export function hashUserIdForObserve(userId?: string | null): string | undefined {
  const id = userId?.trim();
  if (!id) return undefined;
  return createHash("sha256").update(id).digest("hex").slice(0, 12);
}

function looksLikeVin(value: string): boolean {
  const t = value.trim().toUpperCase();
  return t.length === 17 && /^[A-HJ-NPR-Z0-9]{17}$/.test(t);
}

function looksLikeDataUrl(value: string): boolean {
  return /^data:[a-z0-9.+-]+\/[a-z0-9.+-]+;base64,/i.test(value.trim());
}

function clipScalar(value: unknown): unknown {
  if (typeof value === "string") {
    if (looksLikeDataUrl(value) || looksLikeVin(value)) return undefined;
    return value.length > 120 ? `${value.slice(0, 117)}…` : value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value == null) return undefined;
  return undefined;
}

/** Strip PII / blobs before any log or metadata stamp. */
export function sanitizeSafetyObservePayload(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    const k = key.toLowerCase();
    if (DROP_KEYS.has(k) || k.includes("prompt") || k.includes("image")) {
      continue;
    }
    if (k === "vin" || k.endsWith("vin")) continue;
    if (Array.isArray(value)) {
      if (key === "events" || key === "safetyEvents") {
        out[key] = parseSafetyObserveEvents(value);
      }
      continue;
    }
    const clipped = clipScalar(value);
    if (clipped !== undefined) out[key] = clipped;
  }
  return out;
}

export function logSafetyObserveEvent(
  event: SafetyObserveEvent,
  extra: Record<string, unknown> = {},
  opts?: { userId?: string | null; debugOnly?: boolean },
): void {
  if (opts?.debugOnly && !isChatDriftDebugEnabled()) return;
  try {
    const payload = sanitizeSafetyObservePayload({
      event,
      userHash: hashUserIdForObserve(opts?.userId),
      ...extra,
    });
    console.info("[safety-observe]", payload);
  } catch {
    /* never throw from observe */
  }
}

export function logSafetyObserveEvents(
  events: SafetyObserveEvent[],
  extra: Record<string, unknown> = {},
  opts?: { userId?: string | null },
): void {
  const unique = parseSafetyObserveEvents(events);
  if (!unique.length) return;
  try {
    const payload = sanitizeSafetyObservePayload({
      events: unique,
      userHash: hashUserIdForObserve(opts?.userId),
      ...extra,
    });
    console.info("[safety-observe]", payload);
  } catch {
    /* never throw from observe */
  }
}

export function recallDegradedFromAnchorBlock(
  block: string | null | undefined,
): boolean {
  const m = (block || "").match(
    /\[ANCHOR_STATUS\][^\n]*recalls=(unavailable|regional)/i,
  );
  return Boolean(m);
}

export type SafetyObserveCounts = Partial<Record<SafetyObserveEvent, number>>;

export function aggregateSafetyObserveStats(
  rows: Array<{ events?: unknown }>,
): { counts: SafetyObserveCounts; taggedCalls: number } {
  const counts: SafetyObserveCounts = {};
  let taggedCalls = 0;
  for (const row of rows) {
    const events = parseSafetyObserveEvents(row.events);
    if (!events.length) continue;
    taggedCalls += 1;
    for (const ev of events) {
      counts[ev] = (counts[ev] ?? 0) + 1;
    }
  }
  return { counts, taggedCalls };
}

export function safetyEventsMetadata(
  events: SafetyObserveEvent[],
): { safetyEvents: SafetyObserveEvent[] } | Record<string, never> {
  const unique = parseSafetyObserveEvents(events);
  return unique.length ? { safetyEvents: unique } : {};
}
