/**
 * Local mark for first high-tier safety acknowledgment (mirrors profiles column).
 */

const STORAGE_PREFIX = "garageGenius_safety_advice_ack_";

export function safetyAdviceAckLocalKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

export function readSafetyAdviceAckLocal(userId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(safetyAdviceAckLocalKey(userId)) === "1";
  } catch {
    return false;
  }
}

export function writeSafetyAdviceAckLocal(userId: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(safetyAdviceAckLocalKey(userId), "1");
  } catch {
    /* ignore */
  }
}
