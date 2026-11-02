/**
 * Guard late /api/chat responses after vehicle or thread context switches.
 * AbortController alone is not enough: a 200 can arrive after New topic /
 * Topics / 切车 cleared the UI — epoch discard prevents writing the old
 * assistant into the new vehicle/thread bubbles.
 */

export type ChatRequestAbortReason =
  | "none"
  | "user"
  | "timeout"
  | "context_switch";

/** True when in-flight work was cancelled because the chat target changed. */
export function isContextSwitchAbort(
  reason: ChatRequestAbortReason | string | null | undefined,
): boolean {
  return reason === "context_switch" || reason === "vehicle_switch";
}

/**
 * Whether this request's assistant payload may mutate UI / local focus.
 * - epoch mismatch → New topic / 切车 / Topics after send started
 * - context_switch abort → same, even if fetch already resolved
 */
export function shouldCommitChatResponse(opts: {
  requestEpoch: number;
  currentEpoch: number;
  abortReason?: ChatRequestAbortReason | string | null;
  /** When set, also require the active thread still matches the one we sent on. */
  requestThreadId?: string | null;
  activeThreadId?: string | null;
  requestVehicleId?: string | null;
  activeVehicleId?: string | null;
}): boolean {
  if (opts.requestEpoch !== opts.currentEpoch) return false;
  if (isContextSwitchAbort(opts.abortReason)) return false;
  if (
    opts.requestVehicleId &&
    opts.activeVehicleId &&
    opts.requestVehicleId !== opts.activeVehicleId
  ) {
    return false;
  }
  // Same vehicle, different topic: discard if both ids are known and diverge.
  if (
    opts.requestThreadId &&
    opts.activeThreadId &&
    opts.requestThreadId !== opts.activeThreadId
  ) {
    return false;
  }
  return true;
}
