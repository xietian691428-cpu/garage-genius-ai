/**
 * Common maintenance intervals (miles / months) — educational defaults.
 * Confirm against the owner's manual; never claim a hard "must replace now".
 */

export type DiyDifficulty = "Easy" | "Moderate" | "Advanced";

export type PredictiveItemKey =
  | "engine_oil"
  | "cabin_air_filter"
  | "engine_air_filter"
  | "tire_rotation"
  | "brake_inspection"
  | "spark_plugs"
  | "coolant_flush"
  | "transmission_fluid"
  | "battery_test";

export type PredictiveCatalogItem = {
  key: PredictiveItemKey;
  title: string;
  /** Midpoint used when computing next due from last service */
  intervalMiles: number;
  intervalMilesMin: number;
  intervalMilesMax: number;
  /** Optional months interval (null = mileage-first) */
  intervalMonths: number | null;
  difficulty: DiyDifficulty;
  /** Parts-only ballpark USD; omit for inspection-only */
  estCostUsd?: { min: number; max: number };
  /** Coach playbook slug when available */
  coachSlug?: string;
  /** Keywords to match maintenance_records title/category */
  matchKeywords: string[];
  /** Prefer age-based when no service history (battery) */
  preferVehicleAge?: boolean;
};

export const PREDICTIVE_MAINTENANCE_CATALOG: PredictiveCatalogItem[] = [
  {
    key: "engine_oil",
    title: "Engine oil & filter",
    intervalMiles: 6000,
    intervalMilesMin: 5000,
    intervalMilesMax: 7500,
    intervalMonths: 6,
    difficulty: "Easy",
    estCostUsd: { min: 25, max: 70 },
    coachSlug: "maintenance_oil",
    matchKeywords: ["oil", "oil change", "oil filter", "engine oil"],
  },
  {
    key: "cabin_air_filter",
    title: "Cabin air filter",
    intervalMiles: 17500,
    intervalMilesMin: 15000,
    intervalMilesMax: 20000,
    intervalMonths: 18,
    difficulty: "Easy",
    estCostUsd: { min: 15, max: 30 },
    coachSlug: "maintenance_ac_cooling",
    matchKeywords: ["cabin", "cabin filter", "pollen", "hvac filter"],
  },
  {
    key: "engine_air_filter",
    title: "Engine air filter",
    intervalMiles: 22500,
    intervalMilesMin: 15000,
    intervalMilesMax: 30000,
    intervalMonths: 18,
    difficulty: "Easy",
    estCostUsd: { min: 15, max: 40 },
    coachSlug: "maintenance_oil",
    matchKeywords: ["air filter", "engine air", "intake filter"],
  },
  {
    key: "tire_rotation",
    title: "Tire rotation",
    intervalMiles: 6500,
    intervalMilesMin: 5000,
    intervalMilesMax: 8000,
    intervalMonths: 6,
    difficulty: "Easy",
    estCostUsd: { min: 0, max: 40 },
    coachSlug: "maintenance_tires",
    matchKeywords: ["tire rotation", "rotate tires", "rotation"],
  },
  {
    key: "brake_inspection",
    title: "Brake inspection",
    intervalMiles: 12500,
    intervalMilesMin: 10000,
    intervalMilesMax: 15000,
    intervalMonths: 12,
    difficulty: "Moderate",
    coachSlug: "maintenance_brakes",
    matchKeywords: ["brake", "brakes", "pads", "rotors"],
  },
  {
    key: "spark_plugs",
    title: "Spark plugs",
    intervalMiles: 60000,
    intervalMilesMin: 30000,
    intervalMilesMax: 100000,
    intervalMonths: null,
    difficulty: "Moderate",
    estCostUsd: { min: 40, max: 150 },
    matchKeywords: ["spark", "spark plug", "plugs", "ignition"],
  },
  {
    key: "coolant_flush",
    title: "Coolant flush",
    intervalMiles: 40000,
    intervalMilesMin: 30000,
    intervalMilesMax: 50000,
    intervalMonths: 48,
    difficulty: "Moderate",
    estCostUsd: { min: 30, max: 80 },
    coachSlug: "maintenance_cooling_water_pump",
    matchKeywords: ["coolant", "antifreeze", "flush", "cooling"],
  },
  {
    key: "transmission_fluid",
    title: "Transmission fluid",
    intervalMiles: 45000,
    intervalMilesMin: 30000,
    intervalMilesMax: 60000,
    intervalMonths: null,
    difficulty: "Advanced",
    coachSlug: "maintenance_transmission_cvt",
    matchKeywords: ["transmission", "cvt", "atf", "trans fluid"],
  },
  {
    key: "battery_test",
    title: "Battery test",
    intervalMiles: 36000,
    intervalMilesMin: 30000,
    intervalMilesMax: 45000,
    intervalMonths: 36,
    difficulty: "Easy",
    coachSlug: "maintenance_battery",
    matchKeywords: ["battery", "battery test", "12v"],
    preferVehicleAge: true,
  },
];

export function getCatalogItem(
  key: PredictiveItemKey,
): PredictiveCatalogItem | undefined {
  return PREDICTIVE_MAINTENANCE_CATALOG.find((i) => i.key === key);
}
