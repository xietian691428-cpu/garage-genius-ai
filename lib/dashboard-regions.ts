import type { DashboardRegion } from "@/lib/types/dashboard";
import { focusPartToRegionId } from "@/lib/types/focus";

/**
 * Large tap regions for the vehicle map + Focus Mode.
 * Specific parts are AI-generated; these are navigation zones only.
 */
export const DASHBOARD_REGIONS: DashboardRegion[] = [
  {
    id: "engine",
    name: "Engine Bay",
    shortLabel: "Engine",
    description: "Powertrain, fluids, belts, sensors",
    color: "#f59e0b",
    hitPath:
      "M200 125 Q300 100 400 105 Q500 110 560 145 Q575 175 545 200 Q420 220 280 215 Q200 205 185 170 Z",
    center: { x: 375, y: 155 },
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
  },
  {
    id: "brakes",
    name: "Brake System",
    shortLabel: "Brakes",
    description: "Pads, rotors, calipers, fluid lines",
    color: "#ef4444",
    hitPath:
      "M200 235 Q280 220 360 235 Q440 250 500 240 Q520 255 480 285 Q360 300 240 285 Q180 275 200 235 Z",
    center: { x: 360, y: 260 },
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
  },
  {
    id: "suspension",
    name: "Suspension",
    shortLabel: "Suspension",
    description: "Shocks, struts, control arms, bushings",
    color: "#8b5cf6",
    hitPath:
      "M520 150 Q590 135 650 165 Q680 195 655 230 Q600 250 540 230 Q510 200 520 150 Z",
    center: { x: 595, y: 190 },
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
  },
  {
    id: "battery",
    name: "Battery & Electrical",
    shortLabel: "Electrical",
    description: "Battery, alternator, starter, fuses",
    color: "#22d3ee",
    hitPath:
      "M130 115 Q175 95 220 115 Q240 145 220 175 Q175 190 140 170 Q115 145 130 115 Z",
    center: { x: 175, y: 145 },
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
  },
  {
    id: "tires",
    name: "Tires & Wheels",
    shortLabel: "Tires",
    description: "Tread, pressure, alignment, wheel bearings",
    color: "#34d399",
    hitPath:
      "M215 265 Q255 250 295 270 Q320 295 280 320 Q240 335 210 310 Q195 290 215 265 Z M465 265 Q505 250 545 270 Q570 295 530 320 Q490 335 460 310 Q445 290 465 265 Z",
    center: { x: 380, y: 295 },
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
  },
  {
    id: "hvac",
    name: "HVAC / Climate",
    shortLabel: "HVAC",
    description: "A/C, heater, blower, cabin filter, refrigerant",
    color: "#38bdf8",
    hitPath:
      "M290 95 Q390 78 490 98 Q515 120 490 145 Q390 160 295 145 Q270 120 290 95 Z",
    center: { x: 390, y: 118 },
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
  },
  {
    id: "transmission",
    name: "Transmission",
    shortLabel: "Trans",
    description: "Gearbox, fluid, mounts, shift linkage",
    color: "#f472b6",
    hitPath:
      "M300 195 Q400 180 500 198 Q520 220 495 248 Q400 262 310 248 Q280 225 300 195 Z",
    center: { x: 400, y: 220 },
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
  },
  {
    id: "lights",
    name: "Lights & Visibility",
    shortLabel: "Lights",
    description: "Headlights, taillights, turn signals, bulbs",
    color: "#a3e635",
    hitPath:
      "M95 155 Q130 135 165 155 Q180 180 160 205 Q125 215 95 190 Q85 170 95 155 Z M595 155 Q630 135 665 155 Q680 180 660 205 Q625 215 595 190 Q585 170 595 155 Z",
    center: { x: 380, y: 175 },
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
  },
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
