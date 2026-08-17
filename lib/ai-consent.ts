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

export const AI_CONSENT_COPY = {
  title: "AI processing consent",
  lead: "Before we send anything to our AI provider, please review and agree.",
  recipient: "DeepSeek",
  purpose:
    "Vehicle diagnosis, repair coaching, OBD/photo analysis, and shop-report drafting.",
  dataCategories: [
    "Chat and coach message text you send",
    "Optional photos (vehicle, OBD screen, receipts)",
    "Vehicle context (year/make/model, mileage, tags, selected garage vehicle)",
    "Related diagnostic details needed for the feature you use",
  ],
  refuse:
    "If you decline, we will not call DeepSeek and AI features stay unavailable until you agree.",
  agree: "I agree — send my data to DeepSeek for these features",
  decline: "Not now",
  privacyHint: "Details are in our Privacy Policy (AI processing & processors).",
} as const;
