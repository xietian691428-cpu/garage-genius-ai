/**
 * Free vs Pro history caps (enforced in the client; RLS still scopes by user).
 */

export const FREE_CHAT_MESSAGE_LIMIT = 20;
export const PRO_CHAT_MESSAGE_LIMIT = 200;

/** Free users see this many newest maintenance rows as a teaser. */
export const FREE_MAINTENANCE_PREVIEW = 3;

export function chatHistoryLimit(isPro: boolean): number {
  return isPro ? PRO_CHAT_MESSAGE_LIMIT : FREE_CHAT_MESSAGE_LIMIT;
}

export function maintenanceListLimit(isPro: boolean): number | null {
  return isPro ? null : FREE_MAINTENANCE_PREVIEW;
}
