/**
 * Last 1–2 TurnFocus blobs, keyed by vehicle_id (same isolation as chat history).
 * Used so a weak follow-up ("ok") does not wipe the live job, and so API
 * history can start after a hard intent reset without a Redis/session table.
 *
 * Known limit: this is per-browser localStorage, same as chat transcripts.
 * Phone / desktop / PWA do not sync focus; clearing site data falls back to
 * reconstructing from the last 1–2 user messages in the request payload.
 */

import {
  isChatDriftDebugEnabled,
  parseTurnFocus,
  type DriftCheckResult,
  type TurnFocus,
} from "@/lib/chat-intent-drift";

const KEY_PREFIX = "garageGenius_chatFocus_";

export type ChatFocusStore = {
  vehicleId: string;
  recent: TurnFocus[];
  /** Inclusive start of the API history window after a hard reset. */
  apiHistoryFromId: string | null;
  /** Focus abandoned by the last hard reset — used by stale-topic repair. */
  abandonedFocus: TurnFocus | null;
};

function storageKey(vehicleId: string): string {
  return `${KEY_PREFIX}${vehicleId}`;
}

function emptyStore(vehicleId: string): ChatFocusStore {
  return {
    vehicleId,
    recent: [],
    apiHistoryFromId: null,
    abandonedFocus: null,
  };
}

export function loadChatFocus(vehicleId: string): ChatFocusStore {
  if (typeof window === "undefined" || !vehicleId) {
    return emptyStore(vehicleId);
  }
  try {
    const raw = localStorage.getItem(storageKey(vehicleId));
    if (!raw) return emptyStore(vehicleId);
    const parsed = JSON.parse(raw) as Partial<ChatFocusStore>;
    if (parsed.vehicleId && parsed.vehicleId !== vehicleId) {
      return emptyStore(vehicleId);
    }
    const recent = Array.isArray(parsed.recent)
      ? parsed.recent.map(parseTurnFocus).filter((f): f is TurnFocus => Boolean(f))
      : [];
    return {
      vehicleId,
      recent: recent.slice(0, 2),
      apiHistoryFromId:
        typeof parsed.apiHistoryFromId === "string"
          ? parsed.apiHistoryFromId
          : null,
      abandonedFocus: parseTurnFocus(parsed.abandonedFocus),
    };
  } catch {
    return emptyStore(vehicleId);
  }
}

export function saveChatFocus(vehicleId: string, store: ChatFocusStore): void {
  if (typeof window === "undefined" || !vehicleId) return;
  try {
    const payload: ChatFocusStore = {
      vehicleId,
      recent: store.recent.slice(0, 2),
      apiHistoryFromId: store.apiHistoryFromId,
      abandonedFocus: store.abandonedFocus,
    };
    localStorage.setItem(storageKey(vehicleId), JSON.stringify(payload));
  } catch {
    /* quota / private mode */
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
  store: ChatFocusStore;
  drift: DriftCheckResult;
  latestUserId: string;
}): ChatFocusStore {
  const { vehicleId, store, drift, latestUserId } = opts;
  const hard =
    drift.shouldReset &&
    (drift.reason === "new_high_risk" ||
      drift.reason === "explicit_new_issue");
  const topicShiftNewEpoch =
    drift.shouldReset &&
    drift.reason === "topic_shift" &&
    !store.apiHistoryFromId;

  let apiHistoryFromId = store.apiHistoryFromId;
  if (hard || topicShiftNewEpoch) {
    apiHistoryFromId = latestUserId;
  }

  const abandonedFocus = hard
    ? (drift.previousFocus ?? store.abandonedFocus)
    : store.abandonedFocus;

  const recent = [drift.currentFocus, ...store.recent].slice(0, 2);

  if (isChatDriftDebugEnabled()) {
    console.debug("[chat-drift] persist", {
      vehicleId,
      reason: drift.reason,
      shouldReset: drift.shouldReset,
      apiHistoryFromId,
      summary: drift.currentFocus.summary,
    });
  }

  return {
    vehicleId,
    recent,
    apiHistoryFromId,
    abandonedFocus: abandonedFocus ?? null,
  };
}
