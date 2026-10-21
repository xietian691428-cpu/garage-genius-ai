/**
 * Detect exterior lighting / headlamp intents (en + light es cues).
 * Does not invent fitment — only routes education.
 */

import type { LightingIntentKind } from "@/lib/lighting/types";

const LIGHTING_CORE =
  /\b(head\s*lights?|head\s*lamps?|headlamps?|low\s*beam|high\s*beam|fog\s*lights?|fog\s*lamps?|drl|daytime\s+running\s+lights?|turn\s+signals?|tail\s*lights?|brake\s+lights?|exterior\s+lights?|lamp\s+assembly|light\s+assembly|bulb\s+socket)\b/i;

const ES_LIGHTING =
  /\b(faros?|luces?\s+delanteras?|luz\s+baja|luz\s+alta|antiniebla|luz\s+diurna|intermitentes?|calaveras?|foco|bombilla\s+del\s+faro)\b/i;

const LED_UPGRADE =
  /\b(led\s+upgrade|upgrade\s+to\s+led|hid\s+kit|hid\s+upgrade|swap\s+(to\s+)?leds?|aftermarket\s+led|plug\s*(in|and)\s*play\s+led|led\s+bulbs?\s+in\s+halogen)\b/i;

const LENS_FOG =
  /\b(cloudy\s+lens|hazy\s+lens|yellow(ed)?\s+(lens|headlight)|oxidized\s+lens|lens\s+restor|polish\s+headlights?|foggy\s+(lens|headlight)|condensation\s+in\s+(the\s+)?(light|lamp|headlight)|water\s+in\s+(the\s+)?(light|lamp|headlight)|moisture\s+in\s+(the\s+)?(headlight|lamp))\b/i;

const BUY_PATH =
  /\b(buy|purchase|order|which\s+bulb|what\s+bulb|bulb\s+or\s+assembly|assembly\s+or\s+bulb|sealed\s+beam|replaceable\s+bulb|need\s+to\s+buy|amazon|part\s+number|fitment)\b/i;

const INSTALL_BULB =
  /\b(how\s+to\s+(change|replace|install)\s+(the\s+)?(bulb|headlight\s+bulb)|change\s+(my\s+)?(low\s*beam|headlight)\s+bulb|replace\s+(the\s+)?bulb|bulb\s+steps?)\b/i;

const INSTALL_ASSEMBLY =
  /\b(how\s+to\s+(change|replace|install)\s+(the\s+)?(headlight\s+)?assembly|replace\s+(the\s+)?(whole\s+)?(lamp|headlight)\s+assembly|bumper\s+off\s+.*headlight|remove\s+(the\s+)?bumper\s+.*light)\b/i;

const TROUBLESHOOT =
  /\b(one\s+side\s+(out|dead|dim)|won'?t\s+turn\s+on|not\s+working|flicker|glare|blinding|oncoming\s+(cars?|drivers?)\s+flash|bulb\s+out\s+warning|lamp\s+failure|canbus\s+error|ballast|hid\s+buzz)\b/i;

/**
 * True when the message is about exterior lighting (not CEL "check engine light").
 */
export function isLightingIntent(text: string): boolean {
  const raw = (text || "").trim();
  if (!raw) return false;
  // Avoid CEL / warning-lamp false positives when no exterior lighting cue
  if (
    /\bcheck\s+engine\s+light\b|\bcel\b|\bmil\b|\bservice\s+engine\b/i.test(raw) &&
    !LIGHTING_CORE.test(raw) &&
    !ES_LIGHTING.test(raw) &&
    !LED_UPGRADE.test(raw) &&
    !LENS_FOG.test(raw)
  ) {
    return false;
  }
  return (
    LIGHTING_CORE.test(raw) ||
    ES_LIGHTING.test(raw) ||
    LED_UPGRADE.test(raw) ||
    LENS_FOG.test(raw) ||
    (/\bbulbs?\b/i.test(raw) &&
      /\b(head|low\s*beam|high\s*beam|fog|drl|exterior|lamp)\b/i.test(raw))
  );
}

export function detectLightingIntentKind(text: string): LightingIntentKind {
  const raw = text || "";
  if (!isLightingIntent(raw)) return "general";
  if (LED_UPGRADE.test(raw)) return "led_upgrade";
  if (LENS_FOG.test(raw)) return "lens_fog";
  if (INSTALL_ASSEMBLY.test(raw)) return "install_assembly";
  if (INSTALL_BULB.test(raw)) return "install_bulb";
  if (BUY_PATH.test(raw) || /\bbulb\s+or\s+assembly|assembly\s+or\s+bulb\b/i.test(raw)) {
    return "buy_or_path";
  }
  if (TROUBLESHOOT.test(raw)) return "troubleshoot";
  return "general";
}
