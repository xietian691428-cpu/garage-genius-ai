/**
 * Chat nudge to upload a private owner's manual (per vehicle, dismissible).
 * Cooldowns: "Not now" ≈ 14 days; "Don't have it" ≈ 90 days.
 */

const KEY_PREFIX = "garageGenius_manualNudge_";

/** Soft dismiss ("Not now") — per vehicle. */
export const MANUAL_NUDGE_DISMISS_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;
/** Longer cooldown after "Don't have it?" — per vehicle. */
export const MANUAL_NUDGE_NO_MANUAL_COOLDOWN_MS = 90 * 24 * 60 * 60 * 1000;

export type ManualNudgeState = {
  dismissedAt: number | null;
  /** Longer suppress after owner says they don't have a PDF. */
  noManualUntil: number | null;
  noAnchorSpecStreak: number;
};

function empty(): ManualNudgeState {
  return { dismissedAt: null, noManualUntil: null, noAnchorSpecStreak: 0 };
}

function storageKey(vehicleId: string): string {
  return `${KEY_PREFIX}${vehicleId}`;
}

export function loadManualNudgeState(vehicleId: string): ManualNudgeState {
  if (typeof window === "undefined" || !vehicleId) return empty();
  try {
    const raw = localStorage.getItem(storageKey(vehicleId));
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as Partial<ManualNudgeState>;
    return {
      dismissedAt:
        typeof parsed.dismissedAt === "number" ? parsed.dismissedAt : null,
      noManualUntil:
        typeof parsed.noManualUntil === "number" ? parsed.noManualUntil : null,
      noAnchorSpecStreak:
        typeof parsed.noAnchorSpecStreak === "number"
          ? parsed.noAnchorSpecStreak
          : 0,
    };
  } catch {
    return empty();
  }
}

export function saveManualNudgeState(
  vehicleId: string,
  state: ManualNudgeState,
): void {
  if (typeof window === "undefined" || !vehicleId) return;
  try {
    localStorage.setItem(storageKey(vehicleId), JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

/** "Not now" — 14-day cool-down. */
export function dismissManualNudge(vehicleId: string): void {
  const cur = loadManualNudgeState(vehicleId);
  saveManualNudgeState(vehicleId, {
    ...cur,
    dismissedAt: Date.now(),
    noAnchorSpecStreak: 0,
  });
}

/** "Don't have it?" — 90-day cool-down for spec nudges on this vehicle. */
export function dismissManualNudgeNoCopy(vehicleId: string): void {
  const cur = loadManualNudgeState(vehicleId);
  saveManualNudgeState(vehicleId, {
    ...cur,
    dismissedAt: Date.now(),
    noManualUntil: Date.now() + MANUAL_NUDGE_NO_MANUAL_COOLDOWN_MS,
    noAnchorSpecStreak: 0,
  });
}

export function noteNoAnchorSpecReply(vehicleId: string): ManualNudgeState {
  const cur = loadManualNudgeState(vehicleId);
  const next = {
    ...cur,
    noAnchorSpecStreak: (cur.noAnchorSpecStreak || 0) + 1,
  };
  saveManualNudgeState(vehicleId, next);
  return next;
}

export function resetNoAnchorSpecStreak(vehicleId: string): void {
  const cur = loadManualNudgeState(vehicleId);
  if (!cur.noAnchorSpecStreak) return;
  saveManualNudgeState(vehicleId, { ...cur, noAnchorSpecStreak: 0 });
}

export function shouldShowManualNudge(opts: {
  vehicleId: string;
  hasSearchableManual: boolean;
  isSpecQuestion: boolean;
  highRiskStop: boolean;
  quotaBlocked: boolean;
  /** Inject clock for unit tests. */
  now?: number;
}): boolean {
  if (!opts.vehicleId) return false;
  if (opts.hasSearchableManual) return false;
  if (opts.highRiskStop || opts.quotaBlocked) return false;
  const now = opts.now ?? Date.now();
  const state = loadManualNudgeState(opts.vehicleId);
  if (state.noManualUntil && now < state.noManualUntil) {
    return false;
  }
  if (
    state.dismissedAt &&
    now - state.dismissedAt < MANUAL_NUDGE_DISMISS_COOLDOWN_MS
  ) {
    return false;
  }
  if (opts.isSpecQuestion) return true;
  if (state.noAnchorSpecStreak >= 2) return true;
  return false;
}
