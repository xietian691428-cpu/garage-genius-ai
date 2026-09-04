/**
 * High-risk driving advice — education only.
 * Brake failure / severe steering / active leak → do not drive; arrange a tow.
 */

export const DRIVE_SAFETY_COPY = {
  doNotDrive:
    "Do not drive. Arrange a tow. This is educational safety guidance, not a roadside dispatch.",
  noLimp:
    "Do not limp or slowly drive to a shop if brakes, steering, or an active leak may be failing.",
} as const;

const FAILURE_RE =
  /\b(brake(?:s)?\s+(?:fail(?:ed|ure)?|gone|out)|no brakes|pedal (?:goes )?to the floor|won'?t stop|will not stop|lost steering|steering (?:fail(?:ed|ure)?|gone|locked|won't work)|won'?t steer|will not steer|pouring oil|oil (?:is )?pouring|oil (?:gushing|spraying)|active leak|fluid spraying|leaking (?:badly|heavily|while (?:driving|running)))\b/i;

const LIMP_DRIVE_RE =
  /\b((?:you can|it's ok to|it is ok to|safe to|okay to)\s+(?:slowly\s+)?(?:drive|limp)|slowly drive|limp (?:it |the car )?(?:to|home)|drive (?:it )?(?:slowly )?to (?:the )?(?:shop|dealer))\b/gi;

export function isHighRiskDrivingSituation(text: string): boolean {
  return FAILURE_RE.test(text || "");
}

export function formatDriveSafetyBlock(): string {
  return `[DRIVE_SAFETY]
Education only — not a dispatch service.
If brakes, steering, or an active leak may be failing: ${DRIVE_SAFETY_COPY.doNotDrive}
${DRIVE_SAFETY_COPY.noLimp}
Never say it is OK to slowly drive, limp home, or "just make it to the shop" in that situation.`;
}

/**
 * When the turn is a failure-to-drive situation, strip "slowly drive / limp" advice.
 */
export function applyDriveSafetyGuards(
  reply: string,
  userText?: string,
): string {
  if (!reply?.trim()) return reply;
  const blob = `${userText || ""}\n${reply}`;
  if (!isHighRiskDrivingSituation(blob)) return reply;
  LIMP_DRIVE_RE.lastIndex = 0;
  if (!LIMP_DRIVE_RE.test(reply)) {
    if (!/do not drive|arrange a tow/i.test(reply)) {
      return `${reply.trim()}\n\n${DRIVE_SAFETY_COPY.doNotDrive}`;
    }
    return reply;
  }
  LIMP_DRIVE_RE.lastIndex = 0;
  return reply.replace(LIMP_DRIVE_RE, "do not drive — arrange a tow");
}
