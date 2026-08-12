import type { DashboardRegion } from "@/lib/types/dashboard";
import { focusPartToRegionId } from "@/lib/types/focus";
import { REGION_DIAGRAM_META } from "@/lib/vehicle-diagram-geometry";

function withGeometry(
  region: Omit<DashboardRegion, "hitPath" | "center" | "callout"> & {
    id: keyof typeof REGION_DIAGRAM_META | string;
  },
): DashboardRegion {
  const geo = REGION_DIAGRAM_META[region.id];
  if (!geo) {
    throw new Error(`Missing diagram geometry for region: ${region.id}`);
  }
  return {
    ...region,
    hitPath: geo.hitPath,
    center: geo.center,
    callout: geo.callout,
  };
}

/**
 * Large tap regions for the vehicle map + Focus Mode.
 * Specific parts are AI-generated; these are navigation zones only.
 */
export const DASHBOARD_REGIONS: DashboardRegion[] = [
  withGeometry({
    id: "engine",
    name: "Engine Bay",
    shortLabel: "Engine",
    description: "Powertrain, fluids, belts, sensors",
    color: "#f59e0b",
    quickChecklist: [
      "Check oil level & color on dipstick",
      "Look for leaks under the engine bay",
      "Listen for unusual idle or knocking",
    ],
    symptomHints: [
      "Check engine light on",
      "Rough idle",
      "Oil leak under car",
      "Engine overheating",
    ],
  }),
  withGeometry({
    id: "brakes",
    name: "Brake System",
    shortLabel: "Brakes",
    description: "Pads, rotors, calipers, fluid lines",
    color: "#ef4444",
    quickChecklist: [
      "Press brake pedal — firm, not spongy?",
      "Inspect pad thickness through wheel spokes",
      "Note any squeal or vibration when stopping",
    ],
    symptomHints: [
      "Squeaking when braking",
      "Brake pedal feels soft",
      "Steering wheel shakes when braking",
      "Grinding noise",
    ],
  }),
  withGeometry({
    id: "suspension",
    name: "Suspension",
    shortLabel: "Suspension",
    description: "Shocks, struts, control arms, bushings",
    color: "#8b5cf6",
    quickChecklist: [
      "Push down each corner — excessive bounce?",
      "Drive over bumps — listen for clunks",
      "Check tire wear for uneven patterns",
    ],
    symptomHints: [
      "Bouncy ride",
      "Clunking over bumps",
      "Car pulls to one side",
      "Uneven tire wear",
    ],
  }),
  withGeometry({
    id: "battery",
    name: "Battery & Electrical",
    shortLabel: "Electrical",
    description: "Battery, alternator, starter, fuses",
    color: "#22d3ee",
    quickChecklist: [
      "Check battery terminals for corrosion",
      "Test cabin lights & dash warnings",
      "Note slow crank or dim headlights",
    ],
    symptomHints: [
      "Slow engine crank",
      "Battery warning light",
      "Car won't start",
      "Flickering lights",
    ],
  }),
  withGeometry({
    id: "tires",
    name: "Tires & Wheels",
    shortLabel: "Tires",
    description: "Tread, pressure, alignment, wheel bearings",
    color: "#34d399",
    quickChecklist: [
      "Check all tire pressures (door jamb sticker)",
      "Inspect tread depth with penny test",
      "Look for bulges, cuts, or nails",
    ],
    symptomHints: [
      "Low tire pressure warning",
      "Vibration at highway speed",
      "Uneven tread wear",
      "Steering wheel off-center",
    ],
  }),
  withGeometry({
    id: "hvac",
    name: "HVAC / Climate",
    shortLabel: "HVAC",
    description: "A/C, heater, blower, cabin filter, refrigerant",
    color: "#38bdf8",
    quickChecklist: [
      "Does A/C blow cold within 2–3 minutes?",
      "Check cabin air filter for clogging",
      "Listen for unusual blower or compressor noise",
    ],
    symptomHints: [
      "A/C not cold",
      "Weak airflow from vents",
      "Musty smell from vents",
      "Heater not warming",
    ],
  }),
  withGeometry({
    id: "transmission",
    name: "Transmission",
    shortLabel: "Trans",
    description: "Gearbox, fluid, mounts, shift linkage",
    color: "#f472b6",
    quickChecklist: [
      "Check transmission fluid level/color (if dipstick equipped)",
      "Note slipping, harsh shifts, or delayed engagement",
      "Look for red/brown fluid leaks under the center of the car",
    ],
    symptomHints: [
      "Transmission slipping",
      "Hard or delayed shifting",
      "Whine in gear",
      "Transmission fluid leak",
    ],
  }),
  withGeometry({
    id: "lights",
    name: "Lights & Visibility",
    shortLabel: "Lights",
    description: "Headlights, taillights, turn signals, bulbs",
    color: "#a3e635",
    quickChecklist: [
      "Walk around — all exterior lights working?",
      "Check headlight aim and cloudy lenses",
      "Verify turn signals and brake lights with a helper",
    ],
    symptomHints: [
      "Headlight out",
      "Dim headlights",
      "Turn signal fast-blink",
      "Brake light warning",
    ],
  }),
];

export function getDashboardRegion(id: string): DashboardRegion | undefined {
  const regionId = focusPartToRegionId(id);
  const region = DASHBOARD_REGIONS.find((r) => r.id === regionId);
  if (!region) return undefined;

  // Present AC focus with AC-specific labeling while reusing HVAC geometry
  if (id === "ac") {
    return {
      ...region,
      id: "ac",
      name: "Air Conditioning",
      shortLabel: "A/C",
      description: "Compressor, refrigerant, condenser, cabin cooling",
      color: "#67e8f9",
      symptomHints: [
        "A/C not cold",
        "A/C clutch not engaging",
        "Refrigerant leak smell",
        "Ice on A/C lines",
      ],
    };
  }

  return region;
}
