/**
 * Last 1–2 TurnFocus blobs, keyed by vehicle_id + thread_id.
 * New topic / new thread starts with empty focus (no raised / lighting inherit).
 *
 * Known limit: per-browser localStorage. Phone / desktop do not sync.
 */

import {
  isChatDriftDebugEnabled,
  parseTurnFocus,
  type DriftCheckResult,
  type TurnFocus,
} from "@/lib/chat-intent-drift";

const KEY_PREFIX = "garageGenius_chatFocus_";
/** Legacy vehicle-only key — migrated once into thread-scoped key when possible. */
const LEGACY_KEY_PREFIX = "garageGenius_chatFocus_";

export type ChatFocusStore = {
  vehicleId: string;
  threadId?: string | null;
  recent: TurnFocus[];
  /** Inclusive start of the API history window after a hard reset. */
  apiHistoryFromId: string | null;
  /** Focus abandoned by the last hard reset — used by stale-topic repair. */
  abandonedFocus: TurnFocus | null;
};

function storageKey(vehicleId: string, threadId?: string | null): string {
  if (threadId?.trim()) {
    return `${KEY_PREFIX}${vehicleId}__${threadId.trim()}`;
  }
  return `${LEGACY_KEY_PREFIX}${vehicleId}`;
}

function emptyStore(
  vehicleId: string,
  threadId?: string | null,
): ChatFocusStore {
  return {
    vehicleId,
    threadId: threadId ?? null,
    recent: [],
    apiHistoryFromId: null,
    abandonedFocus: null,
  };
}

export function loadChatFocus(
  vehicleId: string,
  threadId?: string | null,
): ChatFocusStore {
  if (typeof window === "undefined" || !vehicleId) {
    return emptyStore(vehicleId, threadId);
  }
  try {
    const key = storageKey(vehicleId, threadId);
    const raw = localStorage.getItem(key);
    // No legacy vehicle-only fallback when threadId is set — New topic must
    // start with empty focus (no raised / lighting inherit from sibling topics).
    if (!raw) return emptyStore(vehicleId, threadId);
    const parsed = JSON.parse(raw) as Partial<ChatFocusStore>;
    if (parsed.vehicleId && parsed.vehicleId !== vehicleId) {
      return emptyStore(vehicleId, threadId);
    }
    // Never inherit focus saved for a different thread.
    if (
      threadId?.trim() &&
      parsed.threadId &&
      parsed.threadId !== threadId.trim()
    ) {
      return emptyStore(vehicleId, threadId);
    }
    const recent = Array.isArray(parsed.recent)
      ? parsed.recent
          .map(parseTurnFocus)
          .filter((f): f is TurnFocus => Boolean(f))
      : [];
    return {
      vehicleId,
      threadId: threadId ?? parsed.threadId ?? null,
      recent: recent.slice(0, 2),
      apiHistoryFromId:
        typeof parsed.apiHistoryFromId === "string"
          ? parsed.apiHistoryFromId
          : null,
      abandonedFocus: parseTurnFocus(parsed.abandonedFocus),
    };
  } catch {
    return emptyStore(vehicleId, threadId);
  }
}

export function saveChatFocus(
  vehicleId: string,
  store: ChatFocusStore,
  threadId?: string | null,
): void {
  if (typeof window === "undefined" || !vehicleId) return;
  const tid = threadId ?? store.threadId ?? null;
  try {
    const payload: ChatFocusStore = {
      vehicleId,
      threadId: tid,
      recent: store.recent.slice(0, 2),
      apiHistoryFromId: store.apiHistoryFromId,
      abandonedFocus: store.abandonedFocus,
    };
    localStorage.setItem(storageKey(vehicleId, tid), JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}

export function clearChatFocus(
  vehicleId: string,
  threadId?: string | null,
): void {
  if (typeof window === "undefined" || !vehicleId) return;
  try {
    localStorage.removeItem(storageKey(vehicleId, threadId));
  } catch {
    /* ignore */
  }
}

export function previousFocusFromStore(store: ChatFocusStore): TurnFocus | null {
  return store.recent[0] ?? null;
}

export function driftHistoryOptions(
  drift: DriftCheckResult,
  store: ChatFocusStore,
): { latestUserOnly: boolean; fromMessageId?: string } {
  if (!drift.shouldReset) {
    return {
      latestUserOnly: false,
      fromMessageId: store.apiHistoryFromId ?? undefined,
    };
  }
  if (drift.reason === "topic_shift" && store.apiHistoryFromId) {
    return {
      latestUserOnly: false,
      fromMessageId: store.apiHistoryFromId,
    };
  }
  return { latestUserOnly: true };
}

export function nextChatFocusStore(opts: {
  vehicleId: string;
  threadId?: string | null;
  store: ChatFocusStore;
  drift: DriftCheckResult;
  latestUserId: string;
  /** Garage vehicle switch or New topic — start API history at this user turn. */
  vehicleThreadReset?: boolean;
  /** Explicit new topic — empty prior focus. */
  newTopic?: boolean;
}): ChatFocusStore {
  const {
    vehicleId,
    store,
    drift,
    latestUserId,
    vehicleThreadReset,
    newTopic,
    threadId,
  } = opts;
  const hard =
    drift.shouldReset &&
    (drift.reason === "new_high_risk" ||
      drift.reason === "explicit_new_issue");
  const topicShiftNewEpoch =
    drift.shouldReset &&
    drift.reason === "topic_shift" &&
    !store.apiHistoryFromId;

  const hardBoundary = Boolean(vehicleThreadReset || newTopic);

  let apiHistoryFromId = store.apiHistoryFromId;
  if (hardBoundary || hard || topicShiftNewEpoch) {
    apiHistoryFromId = latestUserId;
  }

  const abandonedFocus = hardBoundary
    ? null
    : hard
      ? (drift.previousFocus ?? store.abandonedFocus)
      : store.abandonedFocus;

  const recent = hardBoundary
    ? [drift.currentFocus]
    : [drift.currentFocus, ...store.recent].slice(0, 2);

  if (isChatDriftDebugEnabled()) {
    console.debug("[chat-drift] persist", {
      vehicleId,
      threadId: threadId ?? store.threadId ?? null,
      reason: drift.reason,
      shouldReset: drift.shouldReset,
      apiHistoryFromId,
      summary: drift.currentFocus.summary,
    });
  }

  return {
    vehicleId,
    threadId: threadId ?? store.threadId ?? null,
    recent,
    apiHistoryFromId,
    abandonedFocus: abandonedFocus ?? null,
  };
}
