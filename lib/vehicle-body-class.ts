import type { VehicleInfo } from "@/lib/types/chat";
import { inferVehiclePowertrain } from "@/lib/vehicle-powertrain";

/**
 * Diagram silhouette keys for the Home vehicle systems map.
 * Generic body classes + Tesla model-specific photos (distinctive shapes).
 */
export type VehicleBodyClass =
  | "sedan"
  | "suv"
  | "pickup"
  | "ev"
  | "mpv"
  | "van"
  | "tesla_model_3"
  | "tesla_model_y"
  | "tesla_model_s"
  | "tesla_model_x"
  | "tesla_cybertruck";

const PICKUP_RE =
  /\b(pickup|pick-?up|truck|f-?150|f-?250|f-?350|silverado|sierra|ram\b|1500|2500|3500|tacoma|tundra|ranger|colorado|canyon|frontier|titan|gladiator|ridgeline|maverick|hilux|ranger raptor)\b/;

const VAN_RE =
  /\b(van|cargo van|panel van|面包车|sprinter|transit|promaster|nv200|nv3500|express van|savana|hiace|crafter|trafic|vivaro|kangoo|berlingo|partner|caddy|townace|scudo|ducato|boxer|jumper|staria load)\b/;

/** People-movers / business MPVs / classic 7-seat minivans (not tall body-on-frame SUVs). */
const MPV_RE =
  /\b(mpv|minivan|mini-?van|people.?mover|商务车|七座|7-?seat|7.?seater|odyssey|sienna|carnival|sedona|pacifica|voyager|alphard|vellfire|estima|previa|serena|elgrand|quest|grand caravan|town.?country|routan|ertiga|innova|avanza|xpander|veloz|staria(?!\s*load)|xlb)\b/;

const SUV_RE =
  /\b(suv|crossover|cuv|utility|4runner|rav4|cr-?v|hr-?v|pilot|passport|highlander|4x4|explorer|expedition|escape|edge|bronco|tahoe|suburban|yukon|traverse|equinox|blazer|trailblazer|atlas|tiguan|touareg|q3|q5|q7|q8|x1|x3|x5|x7|glc|gle|gls|g-?wagen|cayenne|macan|ioniq 5|ioniq 7|ev6|id\.?4|id\.?buzz|mach-?e|lightning|outback|forester|ascent|crosstrek|pathfinder|rogue|murano|armada|cx-?[3-9]|cx-?50|cx-?90|tucson|santa fe|palisade|sorento|telluride|sportage|seltos|compass|wrangler|grand cherokee|durango|renegade|defender|discovery|range rover|land cruiser|sequoia|gx|lx|rx|nx|ux|mdx|rdx|encore|enclave|envision)\b/;

function vehicleBlob(
  vehicle?: Pick<
    VehicleInfo,
    "make" | "model" | "submodel" | "tags" | "name"
  > &
    Partial<Pick<VehicleInfo, "engine">> | null,
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

function isTesla(vehicle?: Pick<VehicleInfo, "make"> | null): boolean {
  return /\btesla\b/i.test(vehicle?.make || "");
}

/** Tesla model → dedicated diagram photo (appearance is distinctive). */
export function inferTeslaDiagramKey(
  vehicle?: Pick<
    VehicleInfo,
    "make" | "model" | "submodel" | "name" | "tags"
  > | null,
): VehicleBodyClass | null {
  if (!isTesla(vehicle)) return null;

  const blob = vehicleBlob(vehicle);
  const model = (vehicle?.model || "").toLowerCase().replace(/\s+/g, " ").trim();

  if (/cyber\s*truck|cybertruck/.test(blob)) return "tesla_cybertruck";
  if (/\bmodel\s*y\b/.test(blob) || model === "y" || model.startsWith("y ")) {
    return "tesla_model_y";
  }
  if (/\bmodel\s*x\b/.test(blob) || model === "x" || model.startsWith("x ")) {
    return "tesla_model_x";
  }
  if (/\bmodel\s*s\b/.test(blob) || model === "s" || model.startsWith("s ")) {
    return "tesla_model_s";
  }
  if (/\bmodel\s*3\b/.test(blob) || model === "3" || model.startsWith("3 ")) {
    return "tesla_model_3";
  }

  // Unknown Tesla trim — generic EV silhouette
  return "ev";
}

/**
 * Pick a diagram silhouette from vehicle metadata.
 * Priority: Tesla model photo → van → MPV/7-seat → pickup → SUV → generic EV → sedan.
 */
export function inferVehicleBodyClass(
  vehicle?: Pick<
    VehicleInfo,
    "make" | "model" | "submodel" | "engine" | "tags" | "name"
  > | null,
): VehicleBodyClass {
  const tesla = inferTeslaDiagramKey(vehicle);
  if (tesla) return tesla;

  const blob = vehicleBlob(vehicle);
  const powertrain = inferVehiclePowertrain(vehicle);

  if (VAN_RE.test(blob)) return "van";
  if (MPV_RE.test(blob)) return "mpv";
  if (PICKUP_RE.test(blob)) return "pickup";

  // Non-Tesla BEVs before SUV keyword matches (Mach-E, Ioniq 5, …)
  if (
    powertrain === "bev" ||
    /\b(ev|electric|bev|battery electric)\b/.test(blob)
  ) {
    return "ev";
  }

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
    case "mpv":
      return "MPV / 7-seat";
    case "van":
      return "Van";
    case "tesla_model_3":
      return "Tesla Model 3";
    case "tesla_model_y":
      return "Tesla Model Y";
    case "tesla_model_s":
      return "Tesla Model S";
    case "tesla_model_x":
      return "Tesla Model X";
    case "tesla_cybertruck":
      return "Tesla Cybertruck";
    default:
      return "Sedan";
  }
}
