/**
 * Chat Safety & Disclaimer cadence — attention-first UX.
 * Separate from DeepSeek AI consent (useAiConsent).
 *
 * High-risk DIY callouts live in lib/safety-topics.ts (not here).
 */

import { textNeedsHighRiskSafetyCallout as matchNeedsHighRisk } from "@/lib/safety-topics";

const STORAGE_PREFIX = "garageGenius_chat_disclaimer_";

export const CHAT_DISCLAIMER_REPROMPT_DAYS = 30;
/** Re-show light banner after this many new assistant replies since last ack. */
export const CHAT_DISCLAIMER_REPROMPT_ASSISTANT_COUNT = 20;

export type ChatDisclaimerLocalState = {
  ackAt: string | null;
  assistantCountAtAck: number;
};

export function chatDisclaimerLocalKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

export function readChatDisclaimerLocal(
  userId: string,
): ChatDisclaimerLocalState {
  if (typeof window === "undefined") {
    return { ackAt: null, assistantCountAtAck: 0 };
  }
  try {
    const raw = localStorage.getItem(chatDisclaimerLocalKey(userId));
    if (!raw) return { ackAt: null, assistantCountAtAck: 0 };
    if (raw === "1") {
      // Legacy boolean mark → treat as acknowledged now
      return { ackAt: new Date().toISOString(), assistantCountAtAck: 0 };
    }
    const parsed = JSON.parse(raw) as Partial<ChatDisclaimerLocalState>;
    return {
      ackAt: typeof parsed.ackAt === "string" ? parsed.ackAt : null,
      assistantCountAtAck:
        typeof parsed.assistantCountAtAck === "number"
          ? parsed.assistantCountAtAck
          : 0,
    };
  } catch {
    return { ackAt: null, assistantCountAtAck: 0 };
  }
}

export function writeChatDisclaimerLocal(
  userId: string,
  state: ChatDisclaimerLocalState,
): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(chatDisclaimerLocalKey(userId), JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function shouldShowChatDisclaimerBanner(input: {
  ackAt: string | null;
  assistantCountAtAck: number;
  assistantCountNow: number;
  now?: Date;
}): { show: boolean; mode: "first" | "interval" } {
  const now = input.now ?? new Date();
  if (!input.ackAt) return { show: true, mode: "first" };

  const ackMs = Date.parse(input.ackAt);
  if (!Number.isFinite(ackMs)) return { show: true, mode: "first" };

  const days =
    (now.getTime() - ackMs) / (1000 * 60 * 60 * 24);
  if (days >= CHAT_DISCLAIMER_REPROMPT_DAYS) {
    return { show: true, mode: "interval" };
  }

  const delta = input.assistantCountNow - input.assistantCountAtAck;
  if (delta >= CHAT_DISCLAIMER_REPROMPT_ASSISTANT_COUNT) {
    return { show: true, mode: "interval" };
  }

  return { show: false, mode: "first" };
}

/** @deprecated Prefer matchSafetyTopics from lib/safety-topics — kept for callers. */
export function textNeedsHighRiskSafetyCallout(
  ...parts: Array<string | null | undefined>
): boolean {
  return matchNeedsHighRisk(...parts);
}

export const CHAT_DISCLAIMER_COPY = {
  firstTitle: "Safety & disclaimer",
  firstBody:
    "Garage Genius provides educational guidance only. It isn’t a substitute for a qualified technician. DIY work can be dangerous—stop if you’re unsure.",
  intervalBody:
    "Reminder: this app is educational only. DIY involves risk—stop if you’re unsure, and use a qualified technician when needed.",
  gotIt: "Got it",
  learnMore: "Learn more",
  foldLink: "Educational guidance · Safety notes",
  sheetTitle: "Educational guidance · Safety notes",
  sheetLead:
    "Garage Genius AI is a DIY learning coach. Guidance can be incomplete or wrong. It is not certified repair advice, a diagnosis from a licensed technician, or insurance coverage advice.",
  sheetBullets: [
    "Educational only — not a substitute for a qualified technician.",
    "DIY work can cause injury or vehicle damage — stop if you’re unsure or unsafe.",
    "For brakes, airbags, fuel, high-voltage / EV systems, or working under a lifted vehicle, prefer proper equipment and professional help if you’re not trained.",
    "Before the first AI request we also ask for DeepSeek processing consent (separate from this note).",
  ],
  privacy: "Privacy Policy",
  terms: "Terms of Service",
  close: "Close",
} as const;
