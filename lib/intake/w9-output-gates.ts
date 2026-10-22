/**
 * W9 post-reply guards: hot cooling-cap encouragement + unconfirmed bulb sizes.
 * Deterministic — no extra model call.
 * W10 brake / photo gates live in w10-output-gates.ts and compose after this.
 */

const HOT_OPEN_ENCOURAGE_RE =
  /\b(?:go ahead and |you (?:can|should|may) |safe to |ok to |okay to )?(?:open|remove|unscrew|loosen|crack)\s+(?:the\s+)?(?:hot\s+)?(?:radiator|coolant|pressure)\s*cap\b/gi;

const HOT_OPEN_PLAIN_RE =
  /\b(?:open|remove|unscrew)\s+(?:the\s+)?radiator\s+cap\s+(?:while|when)\s+(?:hot|pressurized)\b/gi;

const PRESCRIBE_BULB_RE =
  /\b(?:buy|order|need|get|use|install|replace with)\s+(?:an?\s+)?(H\d{1,2}|900[45]|HB[34]|D[123]S)\b/gi;

const REPLACE_BATTERY_NOW_RE =
  /\breplace\s+(?:the\s+)?battery\s+now\b/gi;

const STEAM_CONTINUE_DRIVE_RE =
  /\b(?:keep driving|continue driving|drive (?:to|home)|limp)\b/gi;

export type W9GateContext = {
  userText?: string | null;
  /** Lighting structure still unknown this turn. */
  lightingStructureUnknown?: boolean;
  overheatIntent?: boolean;
  steamReported?: boolean;
  batteryIntent?: boolean;
};

/**
 * Strip unsafe DIY encouragement; append stop lines when steam + overheat.
 */
export function applyW9OutputGuards(
  reply: string,
  ctx?: W9GateContext | null,
): string {
  if (!reply?.trim()) return reply;
  let out = reply;

  out = out.replace(
    HOT_OPEN_ENCOURAGE_RE,
    "do not open the radiator/coolant cap until the engine is fully cool",
  );
  out = out.replace(
    HOT_OPEN_PLAIN_RE,
    "do not open the radiator cap while hot",
  );

  if (ctx?.lightingStructureUnknown) {
    out = out.replace(
      PRESCRIBE_BULB_RE,
      "confirm housing type first — do not invent a bulb size",
    );
  }

  if (ctx?.batteryIntent) {
    out = out.replace(
      REPLACE_BATTERY_NOW_RE,
      "do not assume Replace battery now — confirm cranking pattern first",
    );
  }

  if (ctx?.overheatIntent && ctx?.steamReported) {
    if (STEAM_CONTINUE_DRIVE_RE.test(out)) {
      STEAM_CONTINUE_DRIVE_RE.lastIndex = 0;
      out = out.replace(
        STEAM_CONTINUE_DRIVE_RE,
        "do not keep driving — arrange a tow",
      );
    }
    if (!/do not (keep )?driv|arrange a tow|pull over/i.test(out)) {
      out = `${out.trim()}\n\nDo not keep driving with steam / severe overheating. Pull over safely when you can and arrange a tow. Never open a hot cooling system.`;
    }
  }

  return out;
}
