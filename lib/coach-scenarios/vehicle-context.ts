/**
 * Map garage VehicleInfo → coach playbook personalization context.
 */

import type { VehicleInfo } from "@/lib/types/chat";
import { inferVehiclePowertrain } from "@/lib/vehicle-powertrain";
import type { CoachVehicleContext } from "@/lib/coach-scenarios/runtime";

export function toCoachVehicleContext(
  vehicle?: VehicleInfo | null,
): CoachVehicleContext {
  if (!vehicle) return {};
  return {
    id: vehicle.id,
    year: vehicle.year,
    make: vehicle.make,
    model: vehicle.model,
    mileage: vehicle.mileage,
    name: vehicle.name,
    engine: vehicle.engine,
    powertrain: inferVehiclePowertrain(vehicle),
    market: vehicle.market,
    tags: vehicle.tags,
    vin: vehicle.vin,
    submodel: vehicle.submodel,
  };
}
