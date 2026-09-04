/**
 * US DIY high-frequency check paths for Chat inject + chips.
 * Does not change CoachScenarioPlayer — optional playbookSlug only.
 */

import type { VehicleInfo } from "@/lib/types/chat";
import type { CoachPlaybookSlug } from "@/lib/coach-scenarios/catalog";
import { maskParkingBrakeMentions } from "@/lib/safety-topics";

export type DiyPathChip = {
  id: string;
  label: string;
  prompt: string;
  playbookSlug?: CoachPlaybookSlug;
};

export type DiyCheckPathId =
  | "brake_pads"
  | "coolant_topup"
  | "spark_plugs"
  | "tpms"
  | "battery_12v"
  | "seasonal_wipers_battery"
  | "oil_change";

export type DiyCheckPath = {
  id: DiyCheckPathId;
  title: string;
  playbookSlug: CoachPlaybookSlug;
  safetyTopicIds: string[];
  chip: DiyPathChip;
  matches: (text: string) => boolean;
  checkOrder: string[];
  stopDiy: string[];
  specNote: string;
};

const SPEC_NO_INVENT =
  "Do not invent oil/coolant capacity (qt/L), torque (ft-lb / N·m), CCA, or OEM part numbers. Use the owner's manual, cap, door sticker, or a figure already in the vehicle config / [VEHICLE_ANCHOR] for THIS car.";

export const DIY_CHECK_PATHS: readonly DiyCheckPath[] = [
  {
    id: "brake_pads",
    title: "Brake pad inspection / replace (education)",
    playbookSlug: "maintenance_brakes",
    safetyTopicIds: ["brakes", "lifting_under_car"],
    chip: {
      id: "path-brake-pads",
      label: "Pad check order",
      playbookSlug: "maintenance_brakes",
      prompt:
        "Walk me through a safe educational brake-pad check order for THIS vehicle: visual/feel, when to stop DIY, and when to use a shop. Do not invent pad thickness mm, lug torque, or OEM part numbers — use the manual or door sticker. Open the brakes Coach guide if a guided flow helps.",
    },
    matches: (text) => {
      const forBrakes = maskParkingBrakeMentions(text);
      return /\bbrake\s*pads?\b|\brotors?\b|\bcalipers?\b|\bbrakes?\b|\bbraking\b/.test(
        forBrakes,
      );
    },
    checkOrder: [
      "Confirm the car is cool, on level ground, in Park, parking brake set, and wheels chocked before any lift.",
      "If you must raise the vehicle, use rated jack stands on solid ground — never rely on a jack alone (lifting_under_car).",
      "Look through the caliper window or remove the wheel only if you can do so safely: pad material remaining, rotor grooves/blue spots, leaks at the caliper/hose.",
      "Road-test only after the vehicle is fully on the ground with lug hardware snug; confirm pedal firmness in a quiet lot — not in traffic.",
    ],
    stopDiy: [
      "Pedal goes to the floor, pulls hard, ABS light with reduced braking, or fluid is leaking.",
      "You cannot support the vehicle on stands or you are unsure about hardware torque — use a qualified shop.",
      "Do not continue a different job (oil, etc.) if the vehicle is moving or the parking brake is not holding.",
    ],
    specNote: SPEC_NO_INVENT,
  },
  {
    id: "coolant_topup",
    title: "Coolant reservoir top-up (education)",
    playbookSlug: "maintenance_cooling_water_pump",
    safetyTopicIds: ["cooling_hot"],
    chip: {
      id: "path-coolant",
      label: "Coolant top-up",
      playbookSlug: "maintenance_cooling_water_pump",
      prompt:
        "Give a safe educational coolant top-up sequence for THIS vehicle: wait until cool, reservoir only, when to stop and go to a shop. Never open a hot radiator cap. Do not invent mix ratio, capacity quarts, or OEM coolant part numbers.",
    },
    matches: (text) =>
      /\b(top\s*up|top\s*off|add|low)\s+coolant\b|\bcoolant\s+(low|reservoir|overflow|top-?up|top-?off)\b|\bradiator\s+cap\b|\bcoolant\s+leak\b/.test(
        text,
      ),
    checkOrder: [
      "Park level, engine OFF, wait until the engine and radiator are cool to the touch (cooling_hot).",
      "Read the overflow/reservoir MIN–MAX marks — do not open the pressurized radiator cap while hot.",
      "If the engine is fully cool, add the coolant type printed on the existing bottle or owner's manual to the reservoir only; recap firmly.",
      "Watch the temp gauge on a short drive; recheck the cold level later. A rapid drop means a leak — stop topping and inspect/shop.",
    ],
    stopDiy: [
      "Steam, boiling overflow, sweet smell in the cabin, milky oil, or the temp gauge in the red — shut down and do not open the cap.",
      "You cannot identify the correct coolant type from the cap/manual — a shop can fill and pressure-test.",
      "Repeated need to add coolant is a leak/head-gasket concern, not a DIY 'keep filling' job.",
    ],
    specNote: SPEC_NO_INVENT,
  },
  {
    id: "spark_plugs",
    title: "Spark plug inspection (education)",
    playbookSlug: "diagnosis_check_engine",
    safetyTopicIds: [],
    chip: {
      id: "path-spark-plugs",
      label: "Spark plug checks",
      playbookSlug: "diagnosis_check_engine",
      prompt:
        "Give an educational spark-plug check order for THIS vehicle (misfire / rough idle): scan codes, inspect one plug if accessible, when to stop DIY. Do not invent gap, torque ft-lb, or OEM plug part numbers — use the manual. Suggest the Check Engine Coach guide if a guided flow helps.",
    },
    matches: (text) =>
      /\bspark\s*plugs?\b|\bignition\s+coils?\b|\bplug\s+wires?\b/.test(text),
    checkOrder: [
      "Scan for misfire / coil / O2 codes and note which cylinder if given (P030x). Do not clear codes until you have recorded them.",
      "With the engine cool, check coil connectors and obvious oil/coolant in the plug wells — no guessing a plug part number.",
      "If you remove a plug, photograph the insulator/gap vs a known-good; compare to the owner's manual gap if printed — do not invent ft-lb.",
      "Reinstall only with the spec from the manual; if you do not have it, stop and use a shop or look it up — do not guess torque.",
    ],
    stopDiy: [
      "Broken plug, rounded hex, or a plug that will not thread by hand — shop (risk of head damage).",
      "Misfire while driving in traffic, flashing CEL, or raw-fuel smell — stop driving and get it checked.",
      "No gap/torque in the manual or config card: do not invent numbers.",
    ],
    specNote: SPEC_NO_INVENT,
  },
  {
    id: "tpms",
    title: "TPMS / tire pressure (education)",
    playbookSlug: "maintenance_tires",
    safetyTopicIds: ["wheel_road"],
    chip: {
      id: "path-tpms",
      label: "TPMS / pressure",
      playbookSlug: "maintenance_tires",
      prompt:
        "Walk through a cold TPMS / tire-pressure check for THIS vehicle: door-sticker PSI, visual damage, when a shop must handle a sensor. Do not invent PSI or lug ft-lb. If this is roadside on a live lane, prioritize getting clear of traffic (wheel_road).",
    },
    matches: (text) =>
      /\btpms\b|\btire\s+pressure\s+(warning|light|sensor|monitor)\b|\blow[\s-]?pressure\s+(light|warning)\b/.test(
        text,
      ),
    checkOrder: [
      "If you are on a live road/shoulder, hazards on, get clear of traffic before kneeling at a wheel (wheel_road).",
      "Read the door-jamb (or glove-box) cold PSI — that sticker is the spec, not a memory of '32 all around'.",
      "Check all four (and spare if listed) when tires are cold; look for nails, bulges, or a damaged valve stem.",
      "After inflating, drive a few miles; if the TPMS lamp stays on, a sensor/module may need a shop scan — not a guessed OEM number.",
    ],
    stopDiy: [
      "Sidewall bulge, cord showing, or a rapid leak — do not drive; roadside assistance or a shop.",
      "You cannot find the door-sticker PSI — do not invent a number; look it up or ask a shop.",
      "Lug hardware was loosened: torque from the door sticker/manual only, or a shop.",
    ],
    specNote: SPEC_NO_INVENT,
  },
  {
    id: "battery_12v",
    title: "12V battery test / replace (education)",
    playbookSlug: "maintenance_battery",
    safetyTopicIds: ["battery_12v"],
    chip: {
      id: "path-battery-12v",
      label: "12V battery checks",
      playbookSlug: "maintenance_battery",
      prompt:
        "Guide a safe 12V battery test/replace sequence for THIS vehicle: eyes/PPE, swollen case, rest voltage, clamp order. Stop-DIY if the case is swollen, you are in traffic, or you cannot match group size from the existing battery. Do not invent CCA, amp-hours, or OEM battery part numbers.",
    },
    matches: (text) =>
      /\b12[\s-]?v(olt)?\s+batter(?:y|ies)\b|\bjump[\s-]?start\b|\bjumper\s+cables?\b|\bbattery\s+terminals?\b|\bbattery\s+(test|load\s*test|replacement|acid|light)\b|\b(test|replace|jump)\s+(my\s+|the\s+|a\s+)?(12[\s-]?v(olt)?\s+)?(car\s+)?batter(?:y|ies)\b|\b(dead|weak|swollen)\s+(car\s+)?batter(?:y|ies)\b|\bbatter(?:y|ies)\s+(is\s+|are\s+)?(dead|weak|swollen|flat)\b|\bcar\s+batter(?:y|ies)\b/.test(
        text,
      ),
    checkOrder: [
      "Eye protection; no smoking/sparks. Confirm this is the 12V service battery, not orange HV/traction cables (those are shop-only).",
      "Look at the case: swelling, cracks, or acid residue — do not load-test or jump a damaged battery.",
      "With accessories off, measure rest voltage if you have a meter (about 12.6V is typical for a rested healthy 12V — treat as a check, not a pass/fail spec you invent for CCA).",
      "If replacing: match group size and chemistry (flooded vs AGM) from the existing battery/manual. Disconnect negative first; reconnect negative last. Do not invent CCA or an OEM part number.",
    ],
    stopDiy: [
      "Swollen/cracked case, strong sulfur smell, or you are stalled in a live travel lane — get to safety, then a shop or roadside help.",
      "You cannot identify group size / AGM vs flooded from the case or manual.",
      "Hybrid/EV: any orange cable or high-voltage warning — stop; that is not a 12V DIY jump.",
    ],
    specNote: SPEC_NO_INVENT,
  },
  {
    id: "seasonal_wipers_battery",
    title: "Seasonal wipers / 12V battery (education)",
    playbookSlug: "maintenance_winter_prep",
    safetyTopicIds: ["battery_12v"],
    chip: {
      id: "path-seasonal",
      label: "Seasonal wipers / battery",
      playbookSlug: "maintenance_winter_prep",
      prompt:
        "Give a seasonal visibility + 12V battery checklist for THIS vehicle (wiper wipe pattern, washer fluid, battery case/voltage). Do not invent service-due miles, CCA, or OEM wiper part numbers. Suggest the seasonal Coach guide if a guided flow helps.",
    },
    matches: (text) =>
      /\bwiper\s*blades?\b|\bwindshield\s+wipers?\b|\bwinter\s+(prep|tires|battery|wipers?)\b|\bseasonal\s+(prep|wipers?|battery)\b|\bsnow\s+wipers?\b|\brain\s+wipers?\b/.test(
        text,
      ),
    checkOrder: [
      "Wipers: inspect the rubber edge, spray washer, and watch for chatter or skipped fan — replace blades from the size printed on the existing arm/manual, not a guessed OEM number.",
      "Washer reservoir: fill with the fluid type for the season (do not invent mix ratios).",
      "12V battery in cold weather: same visual/swelling/voltage checks as a battery path; weak cranking in cold is a shop load-test, not a guessed CCA.",
      "If mileage is on file, use it only as context (older wipers/battery wear) — never invent a due-at mileage.",
    ],
    stopDiy: [
      "You cannot see in rain/snow after a blade swap — do not drive; shop or roadside.",
      "Swollen battery or no-start in a travel lane — safety first, then a shop.",
      "Frozen washer that will not spray and you need the car in a storm — visibility is a stop condition.",
    ],
    specNote: SPEC_NO_INVENT,
  },
  {
    id: "oil_change",
    title: "Oil change (education)",
    playbookSlug: "maintenance_oil",
    safetyTopicIds: ["lifting_under_car"],
    chip: {
      id: "path-oil-change",
      label: "Oil change checks",
      playbookSlug: "maintenance_oil",
      prompt:
        "Walk through a safe educational oil-change check order for THIS vehicle. If capacity/viscosity is on the config card, you may cite it; otherwise tell me to use the cap and owner's manual — never invent quarts or drain-plug ft-lb.",
    },
    matches: (text) =>
      /\boil[\s-]?change\b|\bdrain\s+plug\b|\boil\s+filter\b|\bhow\s+much\s+oil\b|\boil\s+capacit/.test(
        text,
      ),
    checkOrder: [
      "Engine warm-not-scalding, level ground, PPE. If you raise the car, rated jack stands on solid ground — never a jack alone.",
      "Drain and filter only if you can recap and refill. Fill using the dipstick and the viscosity on the cap / config card — do not guess quarts if they are not in the vehicle config.",
      "Check for leaks at the drain plug and filter after a short idle, then reclean and recheck.",
      "Reset the maintenance light per the owner's steps if you have them; do not invent a next-due mileage if odometer is not saved.",
    ],
    stopDiy: [
      "Stripped drain plug, cracked pan, or oil you cannot stop — shop.",
      "You do not have the fill volume or viscosity from the cap, manual, or config card — do not invent it.",
      "Vehicle stability is in doubt while raised — get clear and use a shop.",
    ],
    specNote: SPEC_NO_INVENT,
  },
];

function seasonalSlugForMonth(month: number): CoachPlaybookSlug {
  if (month >= 5 && month <= 9) return "maintenance_summer_rain_prep";
  return "maintenance_winter_prep";
}

export function matchDiyCheckPath(
  text: string,
  options?: { month?: number },
): DiyCheckPath | null {
  const raw = (text || "").toLowerCase();
  if (!raw.trim()) return null;
  for (const path of DIY_CHECK_PATHS) {
    if (!path.matches(raw)) continue;
    if (path.id === "seasonal_wipers_battery") {
      const month = options?.month ?? new Date().getMonth() + 1;
      const slug = seasonalSlugForMonth(month);
      return {
        ...path,
        playbookSlug: slug,
        chip: { ...path.chip, playbookSlug: slug },
      };
    }
    return path;
  }
  return null;
}

function mileageLine(vehicle?: VehicleInfo | null): string {
  const n = vehicle?.mileage != null ? Number(vehicle.mileage) : 0;
  if (Number.isFinite(n) && n > 0) {
    return `Saved odometer: ${n.toLocaleString()} mi (context only). Do not invent a service-due mileage or interval.`;
  }
  return "Mileage is not on file. Do not invent a service-due mileage or interval.";
}

export function formatDiyPathBlock(
  userMessage: string,
  vehicle?: VehicleInfo | null,
  options?: { month?: number },
): string | null {
  const path = matchDiyCheckPath(userMessage, options);
  if (!path) return null;
  const topics =
    path.safetyTopicIds.length > 0
      ? path.safetyTopicIds.join(", ")
      : "none extra (still follow general DIY safety)";
  const checks = path.checkOrder.map((s, i) => `${i + 1}. ${s}`).join("\n");
  const stops = path.stopDiy.map((s) => `- ${s}`).join("\n");
  return `[DIY_PATH]
Scene: ${path.title}
Coach guide (optional open): ${path.playbookSlug} — do not change Player internals; the owner may open this production slug.
Safety topics to respect: ${topics}
${mileageLine(vehicle)}
Educational check order:
${checks}
Stop DIY / use a shop when:
${stops}
${path.specNote}`;
}

export function diyPathFollowUpChip(
  userText: string,
  options?: { month?: number },
): DiyPathChip | null {
  return matchDiyCheckPath(userText, options)?.chip ?? null;
}
