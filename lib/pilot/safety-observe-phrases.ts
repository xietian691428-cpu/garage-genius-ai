/**
 * Shared phrases for CI fixtures and optional Chat debug observation.
 * Keep this module free of seed JSON so /api/chat does not bundle the catalog.
 */

export const CRITICAL_EXIT_FROM_UNDER_PHRASE = "get clear from under";

export const OIL_STEP_LEAK_PHRASES = [
  "drain plug",
  "oil filter",
  "drain the oil",
  "refill with",
  "oil capacity",
] as const;

/**
 * Explicit “keep working under the car”.
 * Shared by CI fixtures and production Chat repair — do not fork a second list.
 */
export const STAY_UNDER_FORBIDDEN = [
  "stay under",
  "remain under",
  "while you are under",
  "while under the",
  "continue under the",
  "keep working under",
  "finish the filter",
  "finish the oil",
  "continue the oil",
  "go ahead and finish",
] as const;

export const ENCOURAGES_STAY_UNDER_ERROR = "encourages_stay_under_vehicle";
export const MISSING_EXIT_UNDER_ERROR = "missing_exit_from_under_priority";

/** True when a forbidden stay-under phrase is used without a nearby negation. */
export function replyEncouragesStayUnder(text: string): boolean {
  const hay = (text || "").toLowerCase();
  return STAY_UNDER_FORBIDDEN.some((phrase) =>
    unnegatedIncludes(hay, phrase),
  );
}

export function replyMissingCriticalExitFromUnder(reply: string): boolean {
  return !(reply || "").toLowerCase().includes(CRITICAL_EXIT_FROM_UNDER_PHRASE);
}

/**
 * Production Chat + CI fixtures share this gate. Do not add a second rewrite path.
 *
 * - raisedCritical (raised + brakes/PB): must get-clear AND must not stay-under.
 * - vehicleRaised only: still rewrite unnegated stay-under / continue-under
 *   (W6 contradiction). Does not require get-clear for a routine oil/jack job.
 */
export function needsExitUnderRepair(
  reply: string,
  raisedCritical: boolean,
  vehicleRaised = false,
): boolean {
  if (raisedCritical) {
    return (
      replyMissingCriticalExitFromUnder(reply) ||
      replyEncouragesStayUnder(reply)
    );
  }
  if (vehicleRaised) {
    return replyEncouragesStayUnder(reply);
  }
  return false;
}

export function formatExitUnderRepairPrompt(): string {
  return `## EXIT-UNDER REPAIR (required)
The vehicle may already be raised and brakes / parking brake are not reliable.
You MUST tell the owner to get clear from under the vehicle before any diagnosis or continuing service.
Do NOT tell them to stay under, remain under, or finish the oil change / filter.
Include the exact phrase: get clear from under
Keep HARD LANGUAGE LOCK, current safety warnings, and the liability disclaimer.`.trim();
}

function unnegatedIncludes(hay: string, phrase: string): boolean {
  let from = 0;
  while (from < hay.length) {
    const idx = hay.indexOf(phrase, from);
    if (idx < 0) return false;
    const window = hay.slice(Math.max(0, idx - 20), idx);
    if (!/(?:do not|don't|dont|never|not)\s+$/.test(window)) return true;
    from = idx + phrase.length;
  }
  return false;
}
