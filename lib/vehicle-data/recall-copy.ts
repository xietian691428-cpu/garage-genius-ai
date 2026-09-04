/**
 * Shared recall education copy (US NHTSA vs UK/EU/other).
 * Never claim a campaign is completed, inapplicable, or that a part must be replaced today.
 */

import {
  normalizeVehicleMarket,
  type VehicleMarketCode,
} from "@/lib/types/vehicle-market";

export const NHTSA_RECALLS_URL = "https://www.nhtsa.gov/recalls";

export const NHTSA_RECALL_FOOTNOTE =
  "NHTSA data for education only. Verify open recalls with your VIN at nhtsa.gov/recalls or a dealer. This is not proof a recall was completed.";

export const NHTSA_RECALL_EMPTY =
  "No open campaigns returned for this YMM. Still verify with your VIN on NHTSA at nhtsa.gov/recalls or a dealer. This is not proof the vehicle has never had a campaign.";

/** Timeout / HTTP miss — never an empty-campaign claim. Must not contain "no recalls". */
export const NHTSA_RECALL_UNAVAILABLE =
  "We couldn't verify recalls right now. Check NHTSA with your VIN at nhtsa.gov/recalls or a dealer.";

export const REGIONAL_RECALL_BODY =
  "Safety campaigns are handled by national authorities and manufacturers in your region. We don’t list a full local recall database here—check your vehicle maker’s site or dealer with your VIN.";

export const REGIONAL_RECALL_UK_EXTRA =
  "In the UK you can also check with DVSA and the manufacturer. We do not look up MOT history in this version.";

/** TODO(later): optional DVSA MOT history — not in this round. */

export function isNhtsaRecallMarket(
  market: VehicleMarketCode | string | null | undefined,
): boolean {
  return normalizeVehicleMarket(market) === "US";
}

export function isRecallQuestion(text: string): boolean {
  if (!text.trim()) return false;
  return /\b(recalls?|nhtsa campaign|safety campaign|product recall|dvsa)\b/i.test(
    text,
  );
}

export function regionalRecallTitle(
  market: VehicleMarketCode | string | null | undefined,
): string {
  const code = normalizeVehicleMarket(market);
  if (code === "GB") return "Regional safety checks (UK)";
  if (code === "EU") return "Regional safety checks (EU / EEA)";
  return "Regional safety checks";
}

export function regionalRecallBody(
  market: VehicleMarketCode | string | null | undefined,
): string {
  const code = normalizeVehicleMarket(market);
  if (code === "GB") {
    return `${REGIONAL_RECALL_BODY} ${REGIONAL_RECALL_UK_EXTRA}`;
  }
  return REGIONAL_RECALL_BODY;
}

/** i18n keys for the vehicle-card regional block (Chat still uses the English strings above). */
export function regionalRecallI18nKeys(
  market: VehicleMarketCode | string | null | undefined,
): { titleKey: string; bodyKey: string } {
  const code = normalizeVehicleMarket(market);
  if (code === "GB") {
    return {
      titleKey: "recalls.regionalTitleGB",
      bodyKey: "recalls.regionalBodyGB",
    };
  }
  if (code === "EU") {
    return {
      titleKey: "recalls.regionalTitleEU",
      bodyKey: "recalls.regionalBody",
    };
  }
  return {
    titleKey: "recalls.regionalTitle",
    bodyKey: "recalls.regionalBody",
  };
}
