/**
 * Local mark for third-party AI (DeepSeek) consent — mirrors profiles column.
 */

const STORAGE_PREFIX = "garageGenius_ai_consent_";

export function aiConsentLocalKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

export function readAiConsentLocal(userId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(aiConsentLocalKey(userId)) === "1";
  } catch {
    return false;
  }
}

export function writeAiConsentLocal(userId: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(aiConsentLocalKey(userId), "1");
  } catch {
    /* ignore */
  }
}

/** True after auth+profile load when a signed-in user has not agreed yet. */
export function shouldAutoShowAiConsent(input: {
  loaded: boolean;
  hasUser: boolean;
  acknowledged: boolean;
}): boolean {
  return input.loaded && input.hasUser && !input.acknowledged;
}

export const AI_CONSENT_COPY = {
  title: "AI processing consent",
  lead: "Before we send anything to our AI providers, please review and agree.",
  recipient:
    "DeepSeek (chat, coaching, and photo vision). Moonshot / Kimi may be used as a backup photo analyzer if DeepSeek vision is unavailable",
  purpose:
    "Vehicle diagnosis, repair coaching, OBD/photo analysis, and shop-report drafting.",
  dataCategories: [
    "Chat and coach message text you send — processed by DeepSeek",
    "Optional photos (vehicle, OBD screen, receipts) — analyzed by DeepSeek vision (Moonshot/Kimi only as backup), then DeepSeek coaches from that description",
    "Vehicle context (year/make/model, mileage, tags, selected garage vehicle)",
    "Related diagnostic details needed for the feature you use",
  ],
  refuse:
    "If you decline, we will not upload photos or send chat text to DeepSeek (or backup photo providers). AI features stay unavailable until you agree.",
  agree:
    "I agree — send chat text and photos to DeepSeek for these features (backup photo provider if needed)",
  decline: "Not now",
  privacyHint: "Details are in our Privacy Policy (AI processing & processors).",
} as const;
