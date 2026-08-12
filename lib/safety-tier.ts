/**
 * Safety tier for playbooks / topics — drives tip bars and high-ack gating.
 * low: routine DIY education · medium: verify if unsure · high: prefer shop verify
 */

import type { CoachPlaybookSlug } from "@/lib/coach-scenarios/catalog";

export type SafetyTier = "low" | "medium" | "high";

/** Playbook slug → tier (defaults to medium if unknown). */
export const PLAYBOOK_SAFETY_TIER: Partial<Record<CoachPlaybookSlug, SafetyTier>> =
  {
    maintenance_oil: "low",
    maintenance_ac_cooling: "low",
    maintenance_body_paint: "low",
    maintenance_summer_rain_prep: "low",
    maintenance_winter_prep: "low",
    maintenance_road_trip: "low",
    maintenance_tires: "medium",
    maintenance_battery: "medium",
    diagnosis_check_engine: "medium",
    diagnosis_electrical_lights_sensors: "medium",
    maintenance_high_mileage: "medium",
    maintenance_value_luxury: "medium",
    maintenance_luxury_euro: "medium",
    maintenance_classic_vintage: "medium",
    maintenance_towing_prep: "medium",
    maintenance_offroad_jeep_subaru: "medium",
    inspection_used_car: "medium",
    maintenance_ev_charging: "medium",
    maintenance_cooling_water_pump: "medium",
    maintenance_fuel_injectors: "high",
    maintenance_brakes: "high",
    maintenance_suspension_struts: "high",
    maintenance_alignment_balance: "high",
    maintenance_transmission_cvt: "high",
    diagnosis_exhaust_emissions: "medium",
    maintenance_modified_car: "medium",
    diagnosis_insurance_post_accident: "high",
  };

const HIGH_TOPIC =
  /\b(brake|brakes|pads?|rotors?|caliper|steering|rack\s+and\s+pinion|airbag|srs|structural|frame\s+rail|unibody|suspension\s+strut|coil\s+spring|strut\s+mount|fuel\s+rail|fuel\s+line|injector\s+rail|timing\s+belt|clutch\s+replacement)\b/i;

const MEDIUM_TOPIC =
  /\b(spark\s+plugs?|battery\s+test|sensor|o2\s+sensor|maf|map\s+sensor|alternator|starter|coolant\s+flush|transmission\s+fluid)\b/i;

export function safetyTierForPlaybook(
  slug?: string | null,
): SafetyTier {
  if (!slug) return "medium";
  return (
    PLAYBOOK_SAFETY_TIER[slug as CoachPlaybookSlug] ?? "medium"
  );
}

/** Infer tier from free text (chat / symptom). */
export function inferSafetyTierFromText(text: string): SafetyTier {
  if (!text?.trim()) return "low";
  if (HIGH_TOPIC.test(text)) return "high";
  if (MEDIUM_TOPIC.test(text)) return "medium";
  return "low";
}

export function combineSafetyTiers(
  a: SafetyTier,
  b: SafetyTier,
): SafetyTier {
  const rank = { low: 0, medium: 1, high: 2 };
  return rank[a] >= rank[b] ? a : b;
}
