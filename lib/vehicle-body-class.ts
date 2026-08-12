import type { VehicleInfo } from "@/lib/types/chat";
import { inferVehiclePowertrain } from "@/lib/vehicle-powertrain";

/**
 * Generic silhouette classes for the Home vehicle systems diagram.
 * Not brand-specific — used only to pick a recognizable side-profile photo.
 */
export type VehicleBodyClass = "sedan" | "suv" | "pickup" | "ev";

const PICKUP_RE =
  /\b(pickup|pick-?up|truck|f-?150|f-?250|f-?350|silverado|sierra|ram\b|1500|2500|3500|tacoma|tundra|ranger|colorado|canyon|frontier|titan|gladiator|ridgeline|maverick|cybertruck|hilux|ranger raptor)\b/;

const SUV_RE =
  /\b(suv|crossover|cuv|utility|4runner|rav4|cr-?v|hr-?v|pilot|passport|highlander|4x4|explorer|expedition|escape|edge|bronco|tahoe|suburban|yukon|traverse|equinox|blazer|trailblazer|atlas|tiguan|touareg|q3|q5|q7|q8|x1|x3|x5|x7|glc|gle|gls|g-?wagen|cayenne|macan|model y|model x|ioniq 5|ioniq 7|ev6|id\.?4|id\.?buzz|mach-?e|lightning|outback|forester|ascent|crosstrek|pathfinder|rogue|murano|armada|cx-?[3-9]|cx-?50|cx-?90|tucson|santa fe|palisade|sorento|telluride|sportage|seltos|compass|wrangler|grand cherokee|durango|journey|renegade|defender|discovery|range rover|land cruiser|sequoia|gx|lx|rx|nx|ux|mdx|rdx|encore|enclave|envision)\b/;

function vehicleBlob(
  vehicle?: Pick<VehicleInfo, "make" | "model" | "submodel" | "engine" | "tags" | "name"> | null,
): string {
  if (!vehicle) return "";
  return [
    vehicle.name,
    vehicle.make,
    vehicle.model,
    vehicle.submodel,
    vehicle.engine,
    ...(vehicle.tags || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/**
 * Pick a diagram silhouette class from vehicle metadata.
 * Priority: BEV → EV photo, then pickup → SUV → sedan default.
 */
export function inferVehicleBodyClass(
  vehicle?: Pick<
    VehicleInfo,
    "make" | "model" | "submodel" | "engine" | "tags" | "name"
  > | null,
): VehicleBodyClass {
  const blob = vehicleBlob(vehicle);
  const powertrain = inferVehiclePowertrain(vehicle);

  // Dedicated EV silhouette for battery-electric vehicles (incl. Model Y / EV SUVs)
  if (powertrain === "bev" || /\b(ev|electric|bev|battery electric)\b/.test(blob)) {
    return "ev";
  }

  if (PICKUP_RE.test(blob)) return "pickup";
  if (SUV_RE.test(blob)) return "suv";
  return "sedan";
}

export function vehicleBodyClassLabel(bodyClass: VehicleBodyClass): string {
  switch (bodyClass) {
    case "ev":
      return "Electric vehicle";
    case "suv":
      return "SUV / crossover";
    case "pickup":
      return "Pickup truck";
    default:
      return "Sedan";
  }
}
