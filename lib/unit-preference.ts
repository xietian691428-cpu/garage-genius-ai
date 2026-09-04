/**
 * Chat unit preference — US customary by default; follow the user's metric if they used it.
 * Does not invent capacities or rewrite every number (spec gate still owns that).
 */

import { normalizeVehicleMarket } from "@/lib/types/vehicle-market";

const USER_METRIC_RE =
  /\b\d+(?:\.\d+)?\s*(?:l|litres?|liters?|bar|kpa|n\s*[·•-]?\s*m|n-?m|newton[\s-]?metres?)\b/i;

const USER_METRIC_WORD_RE = /\b(bar|kpa|n·m|n-m|newton[\s-]?metr)/i;

export function userMessageUsesMetricUnits(text: string): boolean {
  if (!text?.trim()) return false;
  return USER_METRIC_RE.test(text) || USER_METRIC_WORD_RE.test(text);
}

export function formatUnitPreferenceBlock(
  market: string | null | undefined,
  userMessage: string,
): string {
  const us = normalizeVehicleMarket(market) === "US";
  const followMetric = userMessageUsesMetricUnits(userMessage);

  if (followMetric) {
    return `[UNIT_PREF] follow=metric
The owner's latest message used metric units (L / bar / kPa / N·m). Answer in those units. If you also mention US customary, label it as a conversion (e.g. ≈). Do not give two unexplained contradictory numbers for the same quantity.`;
  }

  if (us) {
    return `[UNIT_PREF] follow=us_customary
Vehicle market is US. Default to qt / PSI / ft-lb. Do not mix unexplained metric (L, bar, kPa, N·m) for the same quantity.`;
  }

  return `[UNIT_PREF] follow=market
Follow the vehicle market and the owner's units. Do not mix unexplained contradictory values for the same quantity.`;
}
