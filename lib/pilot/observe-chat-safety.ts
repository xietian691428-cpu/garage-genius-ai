/**
 * Production Chat: observe safety matcher / leak / exit-under hits.
 * Debug logs only — never throw, never reject a reply.
 */

import {
  isChatDriftDebugEnabled,
  logChatDrift,
  matchDriftSafetyTopics,
  needsCriticalRaisedState,
  type TurnFocus,
} from "@/lib/chat-intent-drift";
import { matchSafetyTopicIds } from "@/lib/safety-topics";
import {
  OIL_STEP_LEAK_PHRASES,
  needsExitUnderRepair,
  replyEncouragesStayUnder,
  replyMissingCriticalExitFromUnder,
} from "@/lib/pilot/safety-observe-phrases";

export function observeChatSafetyTurn(input: {
  vehicleId: string;
  userMessage: string;
  reply: string;
  currentFocus: TurnFocus | null;
}): void {
  if (!isChatDriftDebugEnabled()) return;
  try {
    const userTopics = matchDriftSafetyTopics(input.userMessage);
    const replyTopics = matchSafetyTopicIds("", {
      max: 8,
      userText: input.userMessage,
      assistantText: input.reply,
    });
    const lower = (input.reply || "").toLowerCase();
    const oilStepLeakHits = OIL_STEP_LEAK_PHRASES.filter((p) =>
      lower.includes(p),
    );
    const missingExitFromUnder =
      Boolean(
        input.currentFocus && needsCriticalRaisedState(input.currentFocus),
      ) && replyMissingCriticalExitFromUnder(input.reply);
    logChatDrift(
      {
        observe: "chat_safety",
        userTopics,
        replyTopics,
        oilStepLeakHits,
        missingExitFromUnder,
        encouragesStayUnder: replyEncouragesStayUnder(input.reply),
        needsExitUnderRepair: needsExitUnderRepair(
          input.reply,
          Boolean(
            input.currentFocus &&
              needsCriticalRaisedState(input.currentFocus),
          ),
          Boolean(input.currentFocus?.vehicleRaised),
        ),
      },
      input.vehicleId,
    );
  } catch {
    // Observe-only. Never affect Chat.
  }
}
