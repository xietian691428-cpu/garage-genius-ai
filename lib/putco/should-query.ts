import {
  normalizeVehicleMarket,
  type VehicleMarketCode,
} from "@/lib/types/vehicle-market";
import type { PutcoCountry } from "@/lib/putco/types";

/**
 * When to call Putco fitment (max once per Chat turn when true).
 * Oil / DTC-only turns stay off. Pure "what bulb size?" without fitment/Putco
 * language stays off so [LIGHTING_PATH] structure confirm remains primary.
 */
export function shouldQueryPutco(
  userText: string,
  options?: { market?: VehicleMarketCode | string | null },
): boolean {
  const t = (userText || "").trim();
  if (!t) return false;

  // Explicit brand / fitment API ask
  if (/\bputco\b/i.test(t)) return true;
  if (/\bfitment\b/i.test(t)) return true;

  const fitAsk =
    /\b(will|does|do|can)\b[\s\S]{0,40}\bfit\b|\bfit (my|this|the)\b|\bcompatible with\b|\b适配\b|\b适不适合\b|\b能不能装\b|\b能不能买\b|\b会不会装不上\b/i.test(
      t,
    );

  const accessoryOrLighting =
    /\b(light|lights|lamp|lamps|bulb|led|fog|grille|tailgate|running.?board|bed.?cover|rack|hitch|accessory|accessories|headlight|taillight|light.?bar|putco)\b|\b车灯\b|\b雾灯\b|\b灯条\b|\b配件\b|\b大灯\b|\b尾灯\b/i.test(
      t,
    );

  if (fitAsk && accessoryOrLighting) return true;

  // Truck accessory shopping without the word "fit"
  if (
    /\b(truck|f-?150|silverado|sierra|ram|tacoma)\b/i.test(t) &&
    /\b(aftermarket|buy|shopping for|looking for)\b/i.test(t) &&
    accessoryOrLighting
  ) {
    return true;
  }

  // Market alone never triggers; EU skip is handled at call site.
  void options;
  return false;
}

/** Putco live catalog is US/CA only per OpenAPI country enum. */
export function putcoCountryForMarket(
  market: VehicleMarketCode | string | null | undefined,
): PutcoCountry | "skip_eu_uk" {
  const m = normalizeVehicleMarket(market);
  if (m === "CA") return "ca";
  if (m === "US" || m === "MX") return "us";
  // GB / EU / AU / OTHER — do not pretend US catalog = local type approval
  if (m === "GB" || m === "EU" || m === "AU") return "skip_eu_uk";
  return "skip_eu_uk";
}
