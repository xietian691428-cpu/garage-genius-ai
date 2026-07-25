import type { CoachScenario } from "@/lib/types/coach-scenario";
import type { VehicleInfo } from "@/lib/types/chat";
import { inferVehiclePowertrain } from "@/lib/vehicle-powertrain";

export { inferVehiclePowertrain } from "@/lib/vehicle-powertrain";

import oil from "@/content/coach-scenarios/maintenance_oil_production.json";
import brakes from "@/content/coach-scenarios/maintenance_brakes_production.json";
import tires from "@/content/coach-scenarios/maintenance_tires_production.json";
import battery from "@/content/coach-scenarios/maintenance_battery_production.json";
import cel from "@/content/coach-scenarios/diagnosis_check_engine_production.json";
import ev from "@/content/coach-scenarios/maintenance_ev_charging_production.json";
import ac from "@/content/coach-scenarios/maintenance_ac_cooling_production.json";
import winter from "@/content/coach-scenarios/maintenance_winter_prep_production.json";
import transmission from "@/content/coach-scenarios/maintenance_transmission_cvt_production.json";
import roadTrip from "@/content/coach-scenarios/maintenance_road_trip_production.json";
import highMileage from "@/content/coach-scenarios/maintenance_high_mileage_production.json";
import usedCar from "@/content/coach-scenarios/inspection_used_car_production.json";
import luxuryEuro from "@/content/coach-scenarios/maintenance_luxury_euro_production.json";
import valueLuxury from "@/content/coach-scenarios/maintenance_value_luxury_production.json";
import alignment from "@/content/coach-scenarios/maintenance_alignment_balance_production.json";
import suspension from "@/content/coach-scenarios/maintenance_suspension_struts_production.json";
import exhaust from "@/content/coach-scenarios/diagnosis_exhaust_emissions_production.json";
import fuel from "@/content/coach-scenarios/maintenance_fuel_injectors_production.json";
import cooling from "@/content/coach-scenarios/maintenance_cooling_water_pump_production.json";
import electrical from "@/content/coach-scenarios/diagnosis_electrical_lights_sensors_production.json";
import bodyPaint from "@/content/coach-scenarios/maintenance_body_paint_production.json";
import summerRain from "@/content/coach-scenarios/maintenance_summer_rain_prep_production.json";
import modified from "@/content/coach-scenarios/maintenance_modified_car_production.json";
import towing from "@/content/coach-scenarios/maintenance_towing_prep_production.json";
import offroad from "@/content/coach-scenarios/maintenance_offroad_jeep_subaru_production.json";
import classic from "@/content/coach-scenarios/maintenance_classic_vintage_production.json";
import insurance from "@/content/coach-scenarios/diagnosis_insurance_post_accident_production.json";

export type CoachPlaybookSlug =
  | "maintenance_oil"
  | "maintenance_brakes"
  | "maintenance_tires"
  | "maintenance_battery"
  | "diagnosis_check_engine"
  | "maintenance_ev_charging"
  | "maintenance_ac_cooling"
  | "maintenance_winter_prep"
  | "maintenance_transmission_cvt"
  | "maintenance_road_trip"
  | "maintenance_high_mileage"
  | "inspection_used_car"
  | "maintenance_luxury_euro"
  | "maintenance_value_luxury"
  | "maintenance_alignment_balance"
  | "maintenance_suspension_struts"
  | "diagnosis_exhaust_emissions"
  | "maintenance_fuel_injectors"
  | "maintenance_cooling_water_pump"
  | "diagnosis_electrical_lights_sensors"
  | "maintenance_body_paint"
  | "maintenance_summer_rain_prep"
  | "maintenance_modified_car"
  | "maintenance_towing_prep"
  | "maintenance_offroad_jeep_subaru"
  | "maintenance_classic_vintage"
  | "diagnosis_insurance_post_accident";

export type CoachPlaybookMeta = {
  slug: CoachPlaybookSlug;
  phase: 1 | 2 | 3;
  title: string;
  subtitle: string;
  focus_part: CoachScenario["focus_part"];
  category: CoachScenario["category"];
  estimated_minutes: string;
};

/** Ranked guide for the current garage vehicle */
export type CoachRecommendedPlaybook = CoachPlaybookMeta & {
  reason: string;
};

const asScenario = (j: unknown) => j as CoachScenario;

/** All shippable production playbooks (Phase 1–3) */
export const COACH_PRODUCTION_PLAYBOOKS: Record<CoachPlaybookSlug, CoachScenario> = {
  maintenance_oil: asScenario(oil),
  maintenance_brakes: asScenario(brakes),
  maintenance_tires: asScenario(tires),
  maintenance_battery: asScenario(battery),
  diagnosis_check_engine: asScenario(cel),
  maintenance_ev_charging: asScenario(ev),
  maintenance_ac_cooling: asScenario(ac),
  maintenance_winter_prep: asScenario(winter),
  maintenance_transmission_cvt: asScenario(transmission),
  maintenance_road_trip: asScenario(roadTrip),
  maintenance_high_mileage: asScenario(highMileage),
  inspection_used_car: asScenario(usedCar),
  maintenance_luxury_euro: asScenario(luxuryEuro),
  maintenance_value_luxury: asScenario(valueLuxury),
  maintenance_alignment_balance: asScenario(alignment),
  maintenance_suspension_struts: asScenario(suspension),
  diagnosis_exhaust_emissions: asScenario(exhaust),
  maintenance_fuel_injectors: asScenario(fuel),
  maintenance_cooling_water_pump: asScenario(cooling),
  diagnosis_electrical_lights_sensors: asScenario(electrical),
  maintenance_body_paint: asScenario(bodyPaint),
  maintenance_summer_rain_prep: asScenario(summerRain),
  maintenance_modified_car: asScenario(modified),
  maintenance_towing_prep: asScenario(towing),
  maintenance_offroad_jeep_subaru: asScenario(offroad),
  maintenance_classic_vintage: asScenario(classic),
  diagnosis_insurance_post_accident: asScenario(insurance),
};

const PHASE1 = new Set<CoachPlaybookSlug>([
  "maintenance_oil",
  "maintenance_brakes",
  "maintenance_tires",
  "maintenance_battery",
  "diagnosis_check_engine",
]);

const PHASE3 = new Set<CoachPlaybookSlug>([
  "maintenance_luxury_euro",
  "maintenance_value_luxury",
  "maintenance_alignment_balance",
  "maintenance_suspension_struts",
  "diagnosis_exhaust_emissions",
  "maintenance_fuel_injectors",
  "maintenance_cooling_water_pump",
  "diagnosis_electrical_lights_sensors",
  "maintenance_body_paint",
  "maintenance_summer_rain_prep",
  "maintenance_modified_car",
  "maintenance_towing_prep",
  "maintenance_offroad_jeep_subaru",
  "maintenance_classic_vintage",
  "diagnosis_insurance_post_accident",
]);

function phaseOf(slug: CoachPlaybookSlug): 1 | 2 | 3 {
  if (PHASE1.has(slug)) return 1;
  if (PHASE3.has(slug)) return 3;
  return 2;
}

export function listCoachPlaybooks(): CoachPlaybookMeta[] {
  return (Object.keys(COACH_PRODUCTION_PLAYBOOKS) as CoachPlaybookSlug[]).map((slug) => {
    const s = COACH_PRODUCTION_PLAYBOOKS[slug];
    const diy = s.estimated_total_minutes;
    return {
      slug,
      phase: phaseOf(slug),
      title: s.title,
      subtitle: s.subtitle,
      focus_part: s.focus_part,
      category: s.category,
      estimated_minutes: `${diy.diy_min}–${diy.diy_max} min DIY`,
    };
  });
}

export function getCoachPlaybook(slug: string): CoachScenario | null {
  if (slug in COACH_PRODUCTION_PLAYBOOKS) {
    return COACH_PRODUCTION_PLAYBOOKS[slug as CoachPlaybookSlug];
  }
  return null;
}

export function resolveCoachSlugFromFocus(
  part?: string | null,
  opts?: { mileage?: number; powertrain?: string; month?: number; make?: string },
): CoachPlaybookSlug {
  const p = (part || "").toLowerCase();
  const make = (opts?.make || "").toLowerCase();
  const m = opts?.month ?? new Date().getMonth() + 1;

  if (p === "suspension") return "maintenance_suspension_struts";
  if (p === "brakes") return "maintenance_brakes";
  if (p === "lights") return "diagnosis_electrical_lights_sensors";
  if (p === "tires") {
    if (m >= 5 && m <= 9) return "maintenance_summer_rain_prep";
    return "maintenance_alignment_balance";
  }
  if (p === "battery") {
    const pt = (opts?.powertrain || "").toLowerCase();
    if (pt.includes("bev") || pt.includes("phev") || pt.includes("hybrid") || pt.includes("ev")) {
      return "maintenance_ev_charging";
    }
    return "maintenance_battery";
  }
  if (p === "hvac" || p === "ac") return "maintenance_ac_cooling";
  if (p === "transmission") return "maintenance_transmission_cvt";
  if (p === "engine") {
    if (make.includes("porsche") || make.includes("bmw")) return "maintenance_luxury_euro";
    if (make.includes("genesis") || make.includes("acura")) return "maintenance_value_luxury";
    return "diagnosis_check_engine";
  }
  if ((opts?.mileage ?? 0) >= 100000) return "maintenance_high_mileage";
  if (m >= 11 || m <= 2) return "maintenance_winter_prep";
  if (m >= 5 && m <= 9) return "maintenance_summer_rain_prep";
  return "maintenance_oil";
}

function metaForSlug(slug: CoachPlaybookSlug): CoachPlaybookMeta | null {
  const s = COACH_PRODUCTION_PLAYBOOKS[slug];
  if (!s) return null;
  const diy = s.estimated_total_minutes;
  return {
    slug,
    phase: phaseOf(slug),
    title: s.title,
    subtitle: s.subtitle,
    focus_part: s.focus_part,
    category: s.category,
    estimated_minutes: `${diy.diy_min}–${diy.diy_max} min DIY`,
  };
}

type RecommendOpts = {
  month?: number;
  limit?: number;
};

/**
 * Vehicle-aware ranked playbooks for CoachLibrary “Recommended Guides”.
 * Always returns unique slugs, most relevant first.
 */
export function listRecommendedCoachPlaybooks(
  vehicle?: VehicleInfo | null,
  opts?: RecommendOpts,
): CoachRecommendedPlaybook[] {
  const limit = opts?.limit ?? 5;
  const month = opts?.month ?? new Date().getMonth() + 1;
  const make = (vehicle?.make || "").toLowerCase();
  const mileage = vehicle?.mileage ?? 0;
  const powertrain = inferVehiclePowertrain(vehicle);
  const ranked: { slug: CoachPlaybookSlug; reason: string }[] = [];

  const push = (slug: CoachPlaybookSlug, reason: string) => {
    if (ranked.some((r) => r.slug === slug)) return;
    ranked.push({ slug, reason });
  };

  // Seed from seasonal / mileage / make router
  const seed = resolveCoachSlugFromFocus(null, {
    mileage,
    powertrain,
    month,
    make: vehicle?.make,
  });
  push(
    seed,
    mileage >= 100000
      ? `High-mileage care at ${mileage.toLocaleString()} mi`
      : month >= 11 || month <= 2
        ? "Seasonal winter readiness"
        : month >= 5 && month <= 9
          ? "Heat & wet-road season prep"
          : "Top priority for your garage right now",
  );

  if (powertrain === "bev" || powertrain === "phev" || powertrain === "hybrid") {
    push("maintenance_ev_charging", "Matched to your electrified powertrain");
  } else {
    push("maintenance_oil", "Oil is the foundation of ICE longevity");
    push("maintenance_fuel_injectors", "Fuel system care for smoother running");
  }

  if (make.includes("porsche") || make.includes("bmw")) {
    push("maintenance_luxury_euro", `OEM-aware care for ${vehicle?.make}`);
  } else if (make.includes("genesis") || make.includes("acura")) {
    push("maintenance_value_luxury", `Value-luxury schedule for ${vehicle?.make}`);
  } else if (make.includes("jeep") || make.includes("subaru")) {
    push(
      "maintenance_offroad_jeep_subaru",
      `Trail-ready checks for ${vehicle?.make}`,
    );
  }

  const tags = (vehicle?.tags || []).map((t) => t.toLowerCase());
  const tagBlob = tags.join(" ");
  if (
    tags.some((t) => /mod|tuned|turbo|track|stance/.test(t)) ||
    /mod|tuned|turbo/.test((vehicle?.notes || "").toLowerCase())
  ) {
    push("maintenance_modified_car", "Matched to a modified / tuned build");
  }
  if (tags.some((t) => /tow|trailer|hauling/.test(t)) || /tow|trailer/.test(tagBlob)) {
    push("maintenance_towing_prep", "Towing / trailer tag on this vehicle");
  }
  if (
    (vehicle?.year != null && vehicle.year <= 1995) ||
    tags.some((t) => /classic|vintage|antique/.test(t))
  ) {
    push("maintenance_classic_vintage", "Classic / vintage care schedule");
  }

  if (mileage >= 80000) {
    push("maintenance_high_mileage", "Wear items matter more past 80k mi");
    push("maintenance_cooling_water_pump", "Cooling leaks show up with age");
    push("maintenance_transmission_cvt", "Fluid & driveline check-in");
  }

  if (month >= 5 && month <= 9) {
    push("maintenance_ac_cooling", "Cabin cooling load peaks in warm months");
    push("maintenance_summer_rain_prep", "Tires + visibility for summer storms");
  } else if (month >= 11 || month <= 2) {
    push("maintenance_winter_prep", "Cold-weather fluids, battery, and rubber");
    push("maintenance_battery", "Batteries struggle hardest in winter");
  } else {
    push("maintenance_tires", "Pressure & tread before the next trip");
    push("maintenance_brakes", "Quiet pads = safer stops");
  }

  push("maintenance_body_paint", "Protect finish before rust starts");
  push("maintenance_road_trip", "Pre-trip checklist anytime you leave town");

  const out: CoachRecommendedPlaybook[] = [];
  for (const item of ranked) {
    const meta = metaForSlug(item.slug);
    if (!meta) continue;
    out.push({ ...meta, reason: item.reason });
    if (out.length >= limit) break;
  }
  return out;
}
