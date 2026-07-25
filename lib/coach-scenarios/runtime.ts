import type { CoachAdaptiveRule, CoachScenario, CoachScenarioStep } from "@/lib/types/coach-scenario";

export type CoachVehicleContext = {
  year?: number;
  make?: string;
  model?: string;
  mileage?: number;
  name?: string;
  engine?: string;
  powertrain?: string;
  market?: string;
  /** Garage tags — Modified, Tow, Classic, EV, … */
  tags?: string[];
  vin?: string;
  submodel?: string;
};

function includesAny(hay: string, needles?: string[]) {
  if (!needles?.length) return true;
  const h = hay.toLowerCase();
  return needles.some((n) => h.includes(n.toLowerCase()));
}

export function matchAdaptiveRules(
  rules: CoachAdaptiveRule[],
  vehicle: CoachVehicleContext,
): CoachAdaptiveRule[] {
  const mileage = vehicle.mileage ?? 0;
  const make = vehicle.make ?? "";
  const model = vehicle.model ?? "";
  const engine = vehicle.engine ?? "";
  const powertrain = (vehicle.powertrain || "").toLowerCase();
  const market = (vehicle.market || "US").toUpperCase();

  return rules.filter((r) => {
    const w = r.when || {};
    if (w.mileage_min != null && mileage < w.mileage_min) return false;
    if (w.mileage_max != null && mileage > w.mileage_max) return false;
    if (w.brand_includes && !includesAny(make, w.brand_includes)) return false;
    if (w.model_includes && !includesAny(model, w.model_includes)) return false;
    if (w.engine_includes && !includesAny(engine, w.engine_includes)) return false;
    if (w.powertrain?.length) {
      const ok = w.powertrain.some((p) => powertrain.includes(p) || powertrain === p);
      // If vehicle has no powertrain set, don't exclude gas-friendly rules harshly
      if (powertrain && !ok) return false;
    }
    if (w.markets?.length) {
      const mk = market === "CA" ? "CA" : market === "GB" || market === "UK" ? "GB" : market === "EU" ? "EU" : "US";
      if (!w.markets.includes(mk as "US" | "EU" | "GB" | "CA")) return false;
    }
    return true;
  });
}

export function resolveNextServiceMiles(scenario: CoachScenario, mileage: number) {
  const matched = matchAdaptiveRules(scenario.adaptive_rules, { mileage }).find(
    (r) => typeof r.interval_miles === "number",
  );
  const interval =
    matched?.interval_miles ?? scenario.completion.next_check_miles_default ?? 6000;
  return mileage + interval;
}

export function injectTokens(tpl: string, ctx: Record<string, string | number>) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(ctx[k] ?? ""));
}

export function applyStepVariants(
  step: CoachScenarioStep,
  vehicle: CoachVehicleContext,
): CoachScenarioStep {
  if (!step.variants?.length) return step;
  const hit = step.variants.find((v) => {
    const fakeRule = { id: "v", when: v.when, coach_note: "" };
    return matchAdaptiveRules([fakeRule], vehicle).length > 0;
  });
  if (!hit) return step;
  return {
    ...step,
    title: hit.title ?? step.title,
    description: hit.description ?? step.description,
    coach_encourage: hit.coach_encourage ?? step.coach_encourage,
    personalize: hit.personalize ?? step.personalize,
    safety_warning:
      hit.safety_warning !== undefined ? hit.safety_warning : step.safety_warning,
    visual_asset_key: hit.visual_asset_key ?? step.visual_asset_key,
  };
}

export function buildTokenContext(
  scenario: CoachScenario,
  vehicle: CoachVehicleContext,
) {
  const mileage = Number(vehicle.mileage || 0);
  const next = resolveNextServiceMiles(scenario, mileage);
  return {
    year: vehicle.year ?? "",
    make: vehicle.make ?? "",
    model: vehicle.model ?? "",
    mileage,
    name: vehicle.name ?? "",
    next_service: next,
    next_service_miles: next,
    engine: vehicle.engine ?? "",
    market: vehicle.market ?? "US",
    submodel: vehicle.submodel ?? "",
    vin: vehicle.vin ?? "",
  };
}
