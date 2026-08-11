/**
 * One-time welcome / co-create note — local mark + profiles.has_seen_welcome_note.
 */

const STORAGE_PREFIX = "garageGenius_welcome_note_seen_";

export const WELCOME_NOTE_FEEDBACK_MAILTO =
  "mailto:xietian691428@gmail.com?subject=Garage%20Genius%20feedback&body=Hi%20team%2C%0A%0AHere%27s%20what%20I%27d%20love%20to%20see%20improved%3A%0A%0A";

export function welcomeNoteLocalKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

export function readWelcomeNoteSeenLocal(userId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(welcomeNoteLocalKey(userId)) === "1";
  } catch {
    return false;
  }
}

export function writeWelcomeNoteSeenLocal(userId: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(welcomeNoteLocalKey(userId), "1");
  } catch {
    /* quota / private mode */
  }
}

/** Dev/E2E helper — clear local mark only. */
export function clearWelcomeNoteSeenLocal(userId: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(welcomeNoteLocalKey(userId));
  } catch {
    /* ignore */
  }
}
