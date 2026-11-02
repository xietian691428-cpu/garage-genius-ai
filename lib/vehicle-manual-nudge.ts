/**
 * Chat nudge to upload a private owner's manual (per vehicle, dismissible).
 */

const KEY_PREFIX = "garageGenius_manualNudge_";
const COOLDOWN_MS = 10 * 24 * 60 * 60 * 1000; // 10 days

export type ManualNudgeState = {
  dismissedAt: number | null;
  noAnchorSpecStreak: number;
};

function empty(): ManualNudgeState {
  return { dismissedAt: null, noAnchorSpecStreak: 0 };
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

export function dismissManualNudge(vehicleId: string): void {
  const cur = loadManualNudgeState(vehicleId);
  saveManualNudgeState(vehicleId, {
    ...cur,
    dismissedAt: Date.now(),
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
}): boolean {
  if (!opts.vehicleId) return false;
  if (opts.hasSearchableManual) return false;
  if (opts.highRiskStop || opts.quotaBlocked) return false;
  const state = loadManualNudgeState(opts.vehicleId);
  if (
    state.dismissedAt &&
    Date.now() - state.dismissedAt < COOLDOWN_MS
  ) {
    return false;
  }
  if (opts.isSpecQuestion) return true;
  if (state.noAnchorSpecStreak >= 2) return true;
  return false;
}
