/**
 * W10 post-reply guards: brake DIY bleed / open-line encouragement,
 * Replace master cylinder now, and photo→H-number prescriptions.
 * Deterministic — no extra model call.
 */

const BLEED_BRAKE_RE =
  /\b(?:bleed|bleeding|purge)\s+(?:the\s+)?(?:brakes?|brake\s+system|abs)\b/gi;

const OPEN_BRAKE_LINE_RE =
  /\b(?:open|crack|loosen|unscrew)\s+(?:the\s+)?(?:brake\s+)?(?:line|hose|bleeder|caliper\s+(?:banjo|bolt))\b/gi;

const DRAIN_BRAKE_FLUID_RE =
  /\b(?:drain|empty|suck(?:\s+out)?|siphon)\s+(?:the\s+)?(?:brake\s+)?fluid\b/gi;

const REPLACE_MASTER_NOW_RE =
  /\breplace\s+(?:the\s+)?master\s+cylinder\s+now\b/gi;

const PHOTO_PROVES_BULB_RE =
  /\b(?:photo|picture|image)\s+(?:shows?|proves?|confirms?)\s+(?:it(?:'s| is)\s+)?(?:an?\s+)?(H\d{1,2}|900[45]|HB[34]|D[123]S)\b/gi;

const ACCORDING_TO_PHOTO_H_RE =
  /\b(?:according to|from)\s+(?:the\s+)?(?:photo|picture|image).{0,40}\b(H\d{1,2}|900[45]|HB[34])\b/gi;

export type W10GateContext = {
  userText?: string | null;
  brakeIntent?: boolean;
  brakeStopDrive?: boolean;
  lightingStructureUnknown?: boolean;
  /** Low-confidence or unclear housing photo this turn. */
  housingPhotoLowTrust?: boolean;
};

/**
 * Strip brake DIY hydraulics + photo→bulb claims; append stop-drive when needed.
 */
export function applyW10OutputGuards(
  reply: string,
  ctx?: W10GateContext | null,
): string {
  if (!reply?.trim()) return reply;
  let out = reply;

  if (ctx?.brakeIntent) {
    out = out.replace(
      BLEED_BRAKE_RE,
      "do not DIY flush the hydraulic system — see a qualified shop",
    );
    out = out.replace(
      OPEN_BRAKE_LINE_RE,
      "do not open hydraulic fittings yourself — use a qualified shop",
    );
    out = out.replace(
      DRAIN_BRAKE_FLUID_RE,
      "do not empty the reservoir as a DIY first step — observe the cold sight glass only",
    );
    out = out.replace(
      REPLACE_MASTER_NOW_RE,
      "do not assume a failed master cylinder — possible causes only; seek professional inspection",
    );

    if (ctx.brakeStopDrive) {
      if (!/do not drive|arrange a tow|tow\/professional/i.test(out)) {
        out = `${out.trim()}\n\nDo not drive if the pedal is soft/spongy/sinking or the brake warning light is on. Arrange a tow and a professional brake inspection.`;
      }
    }
  }

  if (ctx?.lightingStructureUnknown || ctx?.housingPhotoLowTrust) {
    out = out.replace(
      PHOTO_PROVES_BULB_RE,
      "the photo does not prove a bulb size — confirm housing and read the old bulb / label",
    );
    out = out.replace(
      ACCORDING_TO_PHOTO_H_RE,
      "do not invent a bulb size from the photo alone",
    );
  }

  return out;
}
