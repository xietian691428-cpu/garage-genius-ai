import type { VehicleInfo } from "@/lib/types/chat";
import type { VcdbResolvedConfig } from "@/lib/types/vcdb";
import {
  normalizeVehicleMarket,
  vehicleMarketHint,
  vehicleMarketLabel,
} from "@/lib/types/vehicle-market";
import {
  formatOilLine,
  lookupFluidSpecs,
  type FluidSpecs,
} from "@/lib/vcdb/fluid-specs";

/** Soften VCdb brake labels for DIY display / prompts */
export function humanizeBrakes(raw: string | null | undefined): string {
  if (!raw) return "Not specified";
  let s = raw.trim();
  // front Disc, rear Disc, ABS: 4-Wheel ABS → Front Disc / Rear Disc with ABS
  s = s.replace(/^front\s+/i, "Front ");
  s = s.replace(/,\s*rear\s+/i, " / Rear ");
  s = s.replace(/,\s*ABS:\s*/i, " with ");
  if (/abs/i.test(s) && !/with\s+.*abs/i.test(s)) {
    s = `${s} with ABS`;
  }
  return s;
}

export function vehicleIdentityLine(vehicle: Pick<
  VehicleInfo,
  "year" | "make" | "model" | "submodel"
> & { vcdb?: VcdbResolvedConfig }): string {
  return [
    vehicle.year,
    vehicle.make,
    vehicle.model,
    vehicle.submodel || vehicle.vcdb?.submodel,
  ]
    .filter(Boolean)
    .join(" ");
}

/** Resolve fuel/oil fields from vehicle or curated lookup */
export function resolveFluidFields(vehicle: {
  year: number;
  make: string;
  model: string;
  submodel?: string | null;
  engine?: string | null;
  fuelGrade?: string | null;
  oilCapacity?: string | null;
  oilViscosity?: string | null;
  vcdb?: VcdbResolvedConfig | null;
}): {
  fuelGrade: string | null;
  oilCapacity: string | null;
  oilViscosity: string | null;
  oilLine: string | null;
  fromLookup: boolean;
} {
  const existingGrade =
    vehicle.fuelGrade || vehicle.vcdb?.fuelGrade || null;
  const existingOil =
    vehicle.oilCapacity || vehicle.vcdb?.oilCapacity || null;
  const existingVisc =
    vehicle.oilViscosity || vehicle.vcdb?.oilViscosity || null;

  if (existingGrade && existingOil) {
    const specs: FluidSpecs = {
      fuelGrade: existingGrade,
      oilCapacity: existingOil,
      oilViscosity: existingVisc || undefined,
      source: "curated",
    };
    return {
      fuelGrade: existingGrade,
      oilCapacity: existingOil,
      oilViscosity: existingVisc,
      oilLine: formatOilLine(specs),
      fromLookup: false,
    };
  }

  const looked = lookupFluidSpecs({
    year: vehicle.year,
    make: vehicle.make,
    model: vehicle.model,
    submodel: vehicle.submodel,
    engine: vehicle.engine,
  });

  if (!looked) {
    return {
      fuelGrade: existingGrade,
      oilCapacity: existingOil,
      oilViscosity: existingVisc,
      oilLine: existingOil
        ? formatOilLine({
            fuelGrade: existingGrade || "",
            oilCapacity: existingOil,
            oilViscosity: existingVisc || undefined,
            source: "curated",
          })
        : null,
      fromLookup: false,
    };
  }

  return {
    fuelGrade: existingGrade || looked.fuelGrade,
    oilCapacity: existingOil || looked.oilCapacity,
    oilViscosity: existingVisc || looked.oilViscosity || null,
    oilLine: formatOilLine(looked),
    fromLookup: true,
  };
}

/**
 * Authoritative config block injected into every chat system prompt.
 * Matches the Garage Genius “ACES / RockAuto” style card.
 */
export function formatVehicleConfigCard(vehicle: VehicleInfo): string {
  const vcdb = vehicle.vcdb;
  const identity = vehicleIdentityLine(vehicle);
  const engine = vehicle.engine || vcdb?.engine || "Unknown";
  const transmission =
    vehicle.transmission || vcdb?.transmission || "Not specified";
  const drive = vehicle.driveType || vcdb?.driveType || "Not specified";
  const brakes = humanizeBrakes(vehicle.brakes || vcdb?.brakes);
  const fluids = resolveFluidFields(vehicle);
  const garageOilSaved = Boolean(
    vehicle.oilCapacity?.trim() || vehicle.vcdb?.oilCapacity?.trim(),
  );
  const chatOilLine = garageOilSaved ? fluids.oilLine : null;

  const market = normalizeVehicleMarket(vehicle.market);
  const marketLabel = vehicleMarketLabel(market);
  const marketHint = vehicleMarketHint(market);

  const lines = [
    "## Authoritative Vehicle Configuration",
    identity,
    `- Market / country version: ${market} (${marketLabel}) — ${marketHint}`,
    fluids.fuelGrade || chatOilLine
      ? `- Engine: ${engine}${fluids.fuelGrade ? ` · ${fluids.fuelGrade}` : ""}${
          chatOilLine ? ` · Oil ${chatOilLine}` : ""
        }`
      : `- Engine: ${engine}`,
  ];

  if (fluids.fuelGrade) {
    lines.push(`- Fuel: ${fluids.fuelGrade}`);
  }
  if (chatOilLine) {
    lines.push(
      `- Engine oil: ${chatOilLine} (garage profile — confirm on the fill cap / owner's manual)`,
    );
  }

  lines.push(
    `- Transmission: ${transmission}`,
    `- Drive: ${drive}`,
    `- Brakes: ${brakes}`,
  );

  if (vehicle.mileage != null && Number(vehicle.mileage) > 0) {
    lines.push(`- Mileage: ${Number(vehicle.mileage).toLocaleString()} miles`);
  }
  if (vcdb?.vehicleId) {
    lines.push(`- VCdb VehicleID: ${vcdb.vehicleId}`);
  }

  lines.push("");
  lines.push(
    `Do not assume AWD or different engines. Use only this configuration for parts and repair advice.`,
  );
  lines.push(
    `Respect the Market / country version above: owner manuals, lighting, emissions equipment, fuel labeling (AKI vs RON), units (mi/mph vs km/h), and some powertrains differ by market. Prefer ${market}-spec guidance; if uncertain, say to confirm in the local owner's manual.`,
  );
  if (fluids.fuelGrade || chatOilLine) {
    lines.push(
      `When giving oil-change or fuel guidance, cite only garage-saved Fuel / Engine oil values above and name that source; still remind the user to confirm capacity and viscosity on the fill cap and in the owner's manual. Curated lookup oil figures are not Chat anchors.`,
    );
  } else {
    lines.push(
      `Fuel grade and oil capacity are not verified for this vehicle this turn — tell the user to check the fill cap and owner's manual. Do not invent quarts, liters, 0W-xx as required, ft-lb/N·m, or OEM part numbers.`,
    );
  }
  lines.push(
    `If the user's description conflicts with this config, ask one clarifying question before recommending parts.`,
  );
  lines.push(
    `Never invent OEM part numbers — say to verify with VIN / dealer EPC when unsure.`,
  );

  return lines.join("\n");
}

/** Compact fitment string for Amazon / RockAuto search queries */
export function fitmentSearchString(vehicle: VehicleInfo): string {
  return [
    vehicle.year,
    vehicle.make,
    vehicle.model,
    vehicle.submodel,
    vehicle.engine && vehicle.engine !== "Unknown" ? vehicle.engine : null,
  ]
    .filter(Boolean)
    .join(" ");
}

export function applyVcdbToVehicle(
  vehicle: VehicleInfo,
  resolved: VcdbResolvedConfig,
): VehicleInfo {
  return {
    ...vehicle,
    year: resolved.year,
    make: resolved.make,
    model: resolved.model,
    submodel: resolved.submodel ?? undefined,
    engine: resolved.engine || vehicle.engine || "Unknown",
    transmission: resolved.transmission ?? vehicle.transmission,
    driveType: resolved.driveType ?? undefined,
    brakes: resolved.brakes ?? undefined,
    fuelGrade: resolved.fuelGrade ?? vehicle.fuelGrade,
    oilCapacity: resolved.oilCapacity ?? vehicle.oilCapacity,
    oilViscosity: resolved.oilViscosity ?? vehicle.oilViscosity,
    vcdb: resolved,
  };
}
