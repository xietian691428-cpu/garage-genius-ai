import type { VehicleInfo } from "@/lib/types/chat";

/** Infer powertrain hint from engine string + tags for routing / recommendations. */
export function inferVehiclePowertrain(
  vehicle?: Pick<VehicleInfo, "engine" | "tags" | "make" | "model"> | null,
): string {
  if (!vehicle) return "";
  const blob = [
    vehicle.engine,
    vehicle.make,
    vehicle.model,
    ...(vehicle.tags || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (
    /\bbew\b|\bbev\b|\bev\b|electric|battery electric|tesla|leaf|ioniq 5|ioniq 6|mach-?e|id\.?\d/.test(
      blob,
    )
  ) {
    return "bev";
  }
  if (/\bphev\b|plug-?in hybrid/.test(blob)) return "phev";
  if (/\bhybrid\b|\bhev\b|prius|insight/.test(blob)) return "hybrid";
  if (/\bdiesel\b|\btdi\b|\bcummins\b/.test(blob)) return "diesel";
  return "ice";
}
