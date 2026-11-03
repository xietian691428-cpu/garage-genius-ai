/**
 * Private-manual production observe (upload / mismatch / Save specs).
 * Grep Vercel logs: `[manual-observe]`
 * Never log filenames with PII, VIN, or PDF bytes.
 */

import { hashUserIdForObserve } from "@/lib/safety-observe-events";

export const MANUAL_OBSERVE_EVENTS = [
  "upload_reject",
  "upload_storage_fail",
  "upload_insert_fail",
  "process_ready",
  "process_failed",
  "process_sparse",
  "mismatch",
  "mismatch_confirmed",
  "extract_confirm",
  "extract_reject",
  "extract_edit",
  "manual_deleted",
] as const;

export type ManualObserveEvent = (typeof MANUAL_OBSERVE_EVENTS)[number];

export function logManualObserve(
  event: ManualObserveEvent,
  extra: Record<string, unknown> = {},
  opts?: { userId?: string | null },
): void {
  try {
    const safe: Record<string, unknown> = { event };
    const userHash = hashUserIdForObserve(opts?.userId);
    if (userHash) safe.userHash = userHash;
    for (const [k, v] of Object.entries(extra)) {
      if (v == null) continue;
      const key = k.toLowerCase();
      if (
        key.includes("path") ||
        key.includes("email") ||
        key.includes("vin") ||
        key.includes("token") ||
        key.includes("content") ||
        key.includes("bytes")
      ) {
        continue;
      }
      if (typeof v === "string") {
        safe[k] = v.length > 160 ? `${v.slice(0, 157)}…` : v;
      } else if (
        typeof v === "number" ||
        typeof v === "boolean"
      ) {
        safe[k] = v;
      }
    }
    console.info("[manual-observe]", safe);
  } catch {
    /* never throw from observe */
  }
}
