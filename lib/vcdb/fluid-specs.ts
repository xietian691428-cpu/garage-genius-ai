/**
 * Curated fuel grade + oil capacity enrichment.
 * AutoCare VCdb has fuel *type* (GAS/DIESEL) but not octane or fill volumes.
 * Values are US-market oriented (AKI / quarts) for DIY prompts — always
 * tell the model to confirm against the owner's manual when critical.
 */

export type FluidSpecs = {
  /** e.g. "Regular 87 (AKI)" | "Premium 91+ (AKI)" | "Diesel" */
  fuelGrade: string;
  /** e.g. "4.8 qt with filter" */
  oilCapacity: string;
  /** e.g. "0W-16" | "5W-30" */
  oilViscosity?: string;
  /** Provenance for UI / prompt honesty */
  source: "curated";
};

type FluidRule = {
  make: string;
  model: string;
  yearFrom: number;
  yearTo: number;
  /** Substring match against engine label (case-insensitive); empty = any */
  engineIncludes?: string[];
  /** Optional submodel includes (hybrid, etc.) */
  submodelIncludes?: string[];
  /** Exclude if submodel matches */
  submodelExcludes?: string[];
  specs: Omit<FluidSpecs, "source">;
};

const RULES: FluidRule[] = [
  // ── Toyota Camry ──────────────────────────────────────────
  {
    make: "Toyota",
    model: "Camry",
    yearFrom: 2018,
    yearTo: 2024,
    engineIncludes: ["2.5"],
    submodelExcludes: ["Hybrid"],
    specs: {
      fuelGrade: "Regular 87 (AKI)",
      oilCapacity: "4.8 qt with filter",
      oilViscosity: "0W-16",
    },
  },
  {
    make: "Toyota",
    model: "Camry",
    yearFrom: 2018,
    yearTo: 2024,
    submodelIncludes: ["Hybrid"],
    specs: {
      fuelGrade: "Regular 87 (AKI)",
      oilCapacity: "4.4 qt with filter",
      oilViscosity: "0W-16",
    },
  },
  {
    make: "Toyota",
    model: "Camry",
    yearFrom: 2012,
    yearTo: 2017,
    engineIncludes: ["2.5"],
    specs: {
      fuelGrade: "Regular 87 (AKI)",
      oilCapacity: "4.6 qt with filter",
      oilViscosity: "0W-20",
    },
  },
  {
    make: "Toyota",
    model: "Camry",
    yearFrom: 2012,
    yearTo: 2017,
    engineIncludes: ["3.5"],
    specs: {
      fuelGrade: "Regular 87 (AKI)",
      oilCapacity: "6.4 qt with filter",
      oilViscosity: "0W-20",
    },
  },
  // ── Toyota Corolla ────────────────────────────────────────
  {
    make: "Toyota",
    model: "Corolla",
    yearFrom: 2019,
    yearTo: 2024,
    engineIncludes: ["2.0"],
    submodelExcludes: ["Hybrid"],
    specs: {
      fuelGrade: "Regular 87 (AKI)",
      oilCapacity: "4.4 qt with filter",
      oilViscosity: "0W-16",
    },
  },
  {
    make: "Toyota",
    model: "Corolla",
    yearFrom: 2014,
    yearTo: 2018,
    engineIncludes: ["1.8"],
    specs: {
      fuelGrade: "Regular 87 (AKI)",
      oilCapacity: "4.4 qt with filter",
      oilViscosity: "0W-20",
    },
  },
  // ── Honda Civic ───────────────────────────────────────────
  {
    make: "Honda",
    model: "Civic",
    yearFrom: 2016,
    yearTo: 2021,
    engineIncludes: ["2.0"],
    specs: {
      fuelGrade: "Regular 87 (AKI)",
      oilCapacity: "3.9 qt with filter",
      oilViscosity: "0W-20",
    },
  },
  {
    make: "Honda",
    model: "Civic",
    yearFrom: 2016,
    yearTo: 2021,
    engineIncludes: ["1.5", "Turbo"],
    specs: {
      fuelGrade: "Regular 87 (AKI)",
      oilCapacity: "3.7 qt with filter",
      oilViscosity: "0W-20",
    },
  },
  {
    make: "Honda",
    model: "Civic",
    yearFrom: 2022,
    yearTo: 2025,
    engineIncludes: ["2.0"],
    specs: {
      fuelGrade: "Regular 87 (AKI)",
      oilCapacity: "4.4 qt with filter",
      oilViscosity: "0W-20",
    },
  },
  {
    make: "Honda",
    model: "Civic",
    yearFrom: 2022,
    yearTo: 2025,
    engineIncludes: ["1.5", "Turbo"],
    specs: {
      fuelGrade: "Regular 87 (AKI)",
      oilCapacity: "3.7 qt with filter",
      oilViscosity: "0W-20",
    },
  },
  // ── Honda Accord ──────────────────────────────────────────
  {
    make: "Honda",
    model: "Accord",
    yearFrom: 2018,
    yearTo: 2022,
    engineIncludes: ["1.5"],
    specs: {
      fuelGrade: "Regular 87 (AKI)",
      oilCapacity: "3.7 qt with filter",
      oilViscosity: "0W-20",
    },
  },
  {
    make: "Honda",
    model: "Accord",
    yearFrom: 2018,
    yearTo: 2022,
    engineIncludes: ["2.0"],
    submodelExcludes: ["Hybrid"],
    specs: {
      fuelGrade: "Premium 91+ (AKI)",
      oilCapacity: "4.8 qt with filter",
      oilViscosity: "0W-20",
    },
  },
  // ── Ford F-150 ────────────────────────────────────────────
  {
    make: "Ford",
    model: "F-150",
    yearFrom: 2015,
    yearTo: 2020,
    engineIncludes: ["3.5", "EcoBoost", "Turbo"],
    specs: {
      fuelGrade: "Regular 87 (AKI)",
      oilCapacity: "6.0 qt with filter",
      oilViscosity: "5W-30",
    },
  },
  {
    make: "Ford",
    model: "F-150",
    yearFrom: 2015,
    yearTo: 2020,
    engineIncludes: ["5.0"],
    specs: {
      fuelGrade: "Regular 87 (AKI)",
      oilCapacity: "7.7 qt with filter",
      oilViscosity: "5W-20",
    },
  },
  {
    make: "Ford",
    model: "F-150",
    yearFrom: 2021,
    yearTo: 2025,
    engineIncludes: ["3.5", "EcoBoost", "Turbo"],
    specs: {
      fuelGrade: "Regular 87 (AKI)",
      oilCapacity: "6.0 qt with filter",
      oilViscosity: "5W-30",
    },
  },
  // ── Chevrolet Silverado / Equinox ─────────────────────────
  {
    make: "Chevrolet",
    model: "Silverado 1500",
    yearFrom: 2019,
    yearTo: 2024,
    engineIncludes: ["5.3"],
    specs: {
      fuelGrade: "Regular 87 (AKI)",
      oilCapacity: "8.0 qt with filter",
      oilViscosity: "0W-20",
    },
  },
  {
    make: "Chevrolet",
    model: "Equinox",
    yearFrom: 2018,
    yearTo: 2024,
    engineIncludes: ["1.5"],
    specs: {
      fuelGrade: "Regular 87 (AKI)",
      oilCapacity: "5.0 qt with filter",
      oilViscosity: "0W-20",
    },
  },
  // ── Subaru Outback / Forester ─────────────────────────────
  {
    make: "Subaru",
    model: "Outback",
    yearFrom: 2015,
    yearTo: 2019,
    engineIncludes: ["2.5"],
    specs: {
      fuelGrade: "Regular 87 (AKI)",
      oilCapacity: "5.1 qt with filter",
      oilViscosity: "0W-20",
    },
  },
  {
    make: "Subaru",
    model: "Outback",
    yearFrom: 2020,
    yearTo: 2025,
    engineIncludes: ["2.5"],
    specs: {
      fuelGrade: "Regular 87 (AKI)",
      oilCapacity: "4.4 qt with filter",
      oilViscosity: "0W-20",
    },
  },
  {
    make: "Subaru",
    model: "Forester",
    yearFrom: 2019,
    yearTo: 2024,
    engineIncludes: ["2.5"],
    specs: {
      fuelGrade: "Regular 87 (AKI)",
      oilCapacity: "4.4 qt with filter",
      oilViscosity: "0W-20",
    },
  },
  // ── Mazda3 / CX-5 ─────────────────────────────────────────
  {
    make: "Mazda",
    model: "Mazda3",
    yearFrom: 2019,
    yearTo: 2025,
    engineIncludes: ["2.5"],
    specs: {
      fuelGrade: "Regular 87 (AKI)",
      oilCapacity: "4.9 qt with filter",
      oilViscosity: "0W-20",
    },
  },
  {
    make: "Mazda",
    model: "CX-5",
    yearFrom: 2017,
    yearTo: 2025,
    engineIncludes: ["2.5"],
    specs: {
      fuelGrade: "Regular 87 (AKI)",
      oilCapacity: "5.0 qt with filter",
      oilViscosity: "0W-20",
    },
  },
  // ── BMW 3 Series (premium) ────────────────────────────────
  {
    make: "BMW",
    model: "330i",
    yearFrom: 2019,
    yearTo: 2024,
    specs: {
      fuelGrade: "Premium 91+ (AKI)",
      oilCapacity: "5.5 qt with filter",
      oilViscosity: "0W-20",
    },
  },
  {
    make: "BMW",
    model: "3 Series",
    yearFrom: 2016,
    yearTo: 2018,
    engineIncludes: ["2.0"],
    specs: {
      fuelGrade: "Premium 91+ (AKI)",
      oilCapacity: "5.3 qt with filter",
      oilViscosity: "0W-20",
    },
  },
  // ── VW Golf / GTI ─────────────────────────────────────────
  {
    make: "Volkswagen",
    model: "Golf",
    yearFrom: 2015,
    yearTo: 2021,
    engineIncludes: ["1.8", "2.0", "Turbo"],
    specs: {
      fuelGrade: "Premium 91+ (AKI)",
      oilCapacity: "5.3 qt with filter",
      oilViscosity: "0W-20",
    },
  },
  {
    make: "Volkswagen",
    model: "GTI",
    yearFrom: 2015,
    yearTo: 2024,
    specs: {
      fuelGrade: "Premium 91+ (AKI)",
      oilCapacity: "5.7 qt with filter",
      oilViscosity: "0W-20",
    },
  },
  // ── Jeep Wrangler ─────────────────────────────────────────
  {
    make: "Jeep",
    model: "Wrangler",
    yearFrom: 2018,
    yearTo: 2024,
    engineIncludes: ["3.6"],
    specs: {
      fuelGrade: "Regular 87 (AKI)",
      oilCapacity: "5.0 qt with filter",
      oilViscosity: "0W-20",
    },
  },
  // ── Nissan Altima / Rogue ─────────────────────────────────
  {
    make: "Nissan",
    model: "Altima",
    yearFrom: 2019,
    yearTo: 2024,
    engineIncludes: ["2.5"],
    specs: {
      fuelGrade: "Regular 87 (AKI)",
      oilCapacity: "5.1 qt with filter",
      oilViscosity: "0W-20",
    },
  },
  {
    make: "Nissan",
    model: "Rogue",
    yearFrom: 2014,
    yearTo: 2020,
    engineIncludes: ["2.5"],
    specs: {
      fuelGrade: "Regular 87 (AKI)",
      oilCapacity: "4.9 qt with filter",
      oilViscosity: "0W-20",
    },
  },
  {
    make: "Nissan",
    model: "Rogue",
    yearFrom: 2021,
    yearTo: 2025,
    engineIncludes: ["1.5", "2.5"],
    specs: {
      fuelGrade: "Regular 87 (AKI)",
      oilCapacity: "5.1 qt with filter",
      oilViscosity: "0W-20",
    },
  },
  // ── Hyundai / Kia ─────────────────────────────────────────
  {
    make: "Hyundai",
    model: "Elantra",
    yearFrom: 2017,
    yearTo: 2020,
    engineIncludes: ["2.0"],
    specs: {
      fuelGrade: "Regular 87 (AKI)",
      oilCapacity: "4.2 qt with filter",
      oilViscosity: "0W-20",
    },
  },
  {
    make: "Hyundai",
    model: "Tucson",
    yearFrom: 2016,
    yearTo: 2021,
    engineIncludes: ["2.0", "2.4"],
    specs: {
      fuelGrade: "Regular 87 (AKI)",
      oilCapacity: "4.6 qt with filter",
      oilViscosity: "5W-30",
    },
  },
  {
    make: "Kia",
    model: "Sportage",
    yearFrom: 2017,
    yearTo: 2022,
    engineIncludes: ["2.4"],
    specs: {
      fuelGrade: "Regular 87 (AKI)",
      oilCapacity: "4.8 qt with filter",
      oilViscosity: "5W-30",
    },
  },
];

function includesAny(hay: string, needles?: string[]): boolean {
  if (!needles || needles.length === 0) return true;
  const h = hay.toLowerCase();
  return needles.some((n) => h.includes(n.toLowerCase()));
}

function excludesAny(hay: string, needles?: string[]): boolean {
  if (!needles || needles.length === 0) return false;
  const h = hay.toLowerCase();
  return needles.some((n) => h.includes(n.toLowerCase()));
}

export type FluidLookupInput = {
  year: number;
  make: string;
  model: string;
  submodel?: string | null;
  engine?: string | null;
};

/** Best-match curated fluid specs, or null if unknown (do not invent). */
export function lookupFluidSpecs(input: FluidLookupInput): FluidSpecs | null {
  const year = Number(input.year);
  const make = (input.make || "").trim().toLowerCase();
  const model = (input.model || "").trim().toLowerCase();
  const sub = (input.submodel || "").trim();
  const engine = (input.engine || "").trim();

  if (!make || !model || !Number.isFinite(year)) return null;

  let best: { score: number; specs: FluidSpecs } | null = null;

  for (const rule of RULES) {
    if (rule.make.toLowerCase() !== make) continue;
    if (rule.model.toLowerCase() !== model) continue;
    if (year < rule.yearFrom || year > rule.yearTo) continue;
    if (excludesAny(sub, rule.submodelExcludes)) continue;
    if (rule.submodelIncludes && !includesAny(sub, rule.submodelIncludes)) {
      continue;
    }
    if (rule.engineIncludes && !includesAny(engine, rule.engineIncludes)) {
      continue;
    }

    let score = 10;
    if (rule.engineIncludes?.length) score += 5;
    if (rule.submodelIncludes?.length) score += 3;
    // Prefer tighter year windows
    score += Math.max(0, 8 - (rule.yearTo - rule.yearFrom));

    const specs: FluidSpecs = { ...rule.specs, source: "curated" };
    if (!best || score > best.score) best = { score, specs };
  }

  return best?.specs ?? null;
}

/** Format oil line for UI / prompt */
export function formatOilLine(specs: FluidSpecs): string {
  if (specs.oilViscosity) {
    return `${specs.oilCapacity} · ${specs.oilViscosity}`;
  }
  return specs.oilCapacity;
}
