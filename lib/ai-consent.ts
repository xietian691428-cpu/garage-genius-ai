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
    "DeepSeek (chat & coaching text) and Moonshot / Kimi (photo vision analysis)",
  purpose:
    "Vehicle diagnosis, repair coaching, OBD/photo analysis, and shop-report drafting.",
  dataCategories: [
    "Chat and coach message text you send — processed by DeepSeek",
    "Optional photos (vehicle, OBD screen, receipts) — sent to Moonshot/Kimi for visual analysis, then DeepSeek coaches from that description",
    "Vehicle context (year/make/model, mileage, tags, selected garage vehicle)",
    "Related diagnostic details needed for the feature you use",
  ],
  refuse:
    "If you decline, we will not upload photos to Kimi or send chat text to DeepSeek. AI features stay unavailable until you agree.",
  agree:
    "I agree — send chat text to DeepSeek and photos to Kimi/Moonshot for these features",
  decline: "Not now",
  privacyHint: "Details are in our Privacy Policy (AI processing & processors).",
} as const;
