/**
 * OBD values arrive in SAE metric units; US owners read °F / mph / miles.
 */

import { mileageUnitFromMarket, normalizeMileageUnit } from "@/lib/obd-mileage";

export type ObdUnitSystem = "imperial" | "metric";

/** Follow the vehicle's mileage unit (explicit, else from its sales market). */
export function obdUnitSystemForVehicle(
  vehicle?: { mileageUnit?: string | null; market?: string | null } | null,
): ObdUnitSystem {
  if (!vehicle) return "imperial";
  const unit = normalizeMileageUnit(
    vehicle.mileageUnit,
    mileageUnitFromMarket(vehicle.market),
  );
  return unit === "km" ? "metric" : "imperial";
}

const KM_PER_MILE = 1.609344;

/** Convert a metric OBD value + unit into the display system. */
export function convertObdValue(
  value: number,
  unit: string,
  system: ObdUnitSystem,
): { value: number; unit: string } {
  if (system === "metric") return { value, unit };
  switch (unit) {
    case "°C":
      return { value: (value * 9) / 5 + 32, unit: "°F" };
    case "km/h":
      return { value: value / KM_PER_MILE, unit: "mph" };
    case "km":
      return { value: value / KM_PER_MILE, unit: "mi" };
    default:
      return { value, unit };
  }
}

export function formatObdValue(
  value: number | null | undefined,
  unit: string,
  system: ObdUnitSystem = "imperial",
): string {
  if (value == null || Number.isNaN(value)) return "—";
  const c = convertObdValue(value, unit, system);
  switch (c.unit) {
    case "V":
      return `${c.value.toFixed(2)} V`;
    case "%":
      return `${Math.round(c.value * 10) / 10}%`;
    case "°F":
    case "°C":
      return `${Math.round(c.value)}${c.unit}`;
    case "°":
      return `${Math.round(c.value * 10) / 10}°`;
    case "g/s":
      return `${c.value.toFixed(1)} g/s`;
    case "":
    case "rpm":
      return `${Math.round(c.value).toLocaleString()}${c.unit ? " rpm" : ""}`;
    case "s":
      return `${Math.round(c.value).toLocaleString()} s`;
    default:
      return `${Math.round(c.value).toLocaleString()} ${c.unit}`;
  }
}

/** Both systems, for AI prompts: "90°C (194°F)". */
export function formatObdValueBoth(value: number, unit: string): string {
  const metric = formatObdValue(value, unit, "metric");
  const imperial = formatObdValue(value, unit, "imperial");
  return metric === imperial ? metric : `${metric} (${imperial})`;
}
