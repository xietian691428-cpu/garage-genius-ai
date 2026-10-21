/**
 * Resolve educational lighting structure path from YMM (+ optional notes/tags).
 * Never claims VIN-decoded lighting options.
 */

import ymmTable from "@/content/lighting/ymm-common.json";
import type { VehicleInfo } from "@/lib/types/chat";
import { detectLightingIntentKind, isLightingIntent } from "@/lib/lighting/intent";
import type {
  LightingPathResult,
  LightingStructurePath,
  LightingYmmEntry,
} from "@/lib/lighting/types";

const ENTRIES = (ymmTable as { entries: LightingYmmEntry[] }).entries;

const GENERIC_CAUTIONS = [
  "Fitment varies by trim and factory options. Verify on the vehicle or owner's manual before purchase.",
  "Do not invent bulb sizes (H11, 9005, D3S, etc.) or OEM lamp part numbers without an allowlisted hint for THIS vehicle.",
];

const GENERIC_CONFIRM = [
  "Which trim, and do the headlights look like factory LED (often no replaceable bulb)?",
  "Look behind the lamp: twist-off dust cap + plug-in bulb, or a sealed module / heat sink with no bulb?",
];

const LED_UPGRADE_CAUTIONS = [
  "Aftermarket LED/HID bulbs in halogen housings may cause glare for oncoming drivers and may not meet FMVSS 108 / local rules — educational only; we do not claim any swap is legal.",
  "Prefer a headlamp assembly designed for that light source rather than promising a plug-and-play bulb is compliant.",
  "Insurance and inspection rules vary — check local law and your policy; never treat chat as a legality ruling.",
];

function norm(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function matchEntry(vehicle: VehicleInfo): LightingYmmEntry | null {
  const year = Number(vehicle.year);
  const make = norm(vehicle.make);
  const model = norm(vehicle.model);
  if (!Number.isFinite(year) || !make || !model) return null;

  for (const e of ENTRIES) {
    if (year < e.yearMin || year > e.yearMax) continue;
    if (norm(e.make) !== make && !make.includes(norm(e.make))) continue;
    const hit = e.modelIncludes.some((m) => {
      const nm = norm(m);
      return model === nm || model.includes(nm) || nm.includes(model);
    });
    if (hit) return e;
  }
  return null;
}

/**
 * Owner notes/tags may confirm housing type for this session — still not VIN proof.
 */
function noteOverrides(
  vehicle?: VehicleInfo | null,
): LightingStructurePath | null {
  const blob = [
    vehicle?.notes,
    ...(vehicle?.tags || []),
    vehicle?.submodel,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (!blob.trim()) return null;
  if (
    /\b(factory\s+led|oem\s+led|sealed\s+(led|assembly)|led\s+headlamp\s+package|matrix\s+led|adaptive\s+led)\b/.test(
      blob,
    )
  ) {
    return "likely_sealed_or_integrated_led";
  }
  if (
    /\b(halogen\s+(bulb|headlamp|housing)|replaceable\s+bulb|h11\s+confirmed|9005\s+confirmed)\b/.test(
      blob,
    )
  ) {
    return "likely_replaceable_bulb";
  }
  return null;
}

function playbookFor(
  path: LightingStructurePath,
  intent: LightingPathResult["intent"],
): LightingPathResult["playbookSlug"] {
  if (intent === "lens_fog") return "lighting_lens_restore_edu";
  if (intent === "troubleshoot" || intent === "led_upgrade") {
    return "diagnosis_electrical_lights_sensors";
  }
  if (intent === "install_assembly" || path === "likely_sealed_or_integrated_led") {
    return "lighting_replace_assembly_basic";
  }
  if (
    intent === "install_bulb" ||
    intent === "buy_or_path" ||
    path === "likely_replaceable_bulb"
  ) {
    return "lighting_replace_bulb";
  }
  return "diagnosis_electrical_lights_sensors";
}

/**
 * Resolve lighting path for Chat inject. Returns null if message is not lighting.
 */
export function resolveLightingPath(
  vehicle: VehicleInfo | null | undefined,
  userMessage: string,
): LightingPathResult | null {
  if (!isLightingIntent(userMessage)) return null;
  const intent = detectLightingIntentKind(userMessage);
  const override = vehicle ? noteOverrides(vehicle) : null;
  const entry = vehicle ? matchEntry(vehicle) : null;

  let path: LightingStructurePath =
    override || entry?.path || "ambiguous_needs_confirm";
  let confidence = override
    ? ("medium" as const)
    : entry?.confidence || ("low" as const);
  const dataMissing = !entry && !override;

  // LED upgrade intent always adds upgrade cautions; path still from housing
  const cautions = [
    ...GENERIC_CAUTIONS,
    ...(entry?.cautions || []),
    ...(intent === "led_upgrade" ? LED_UPGRADE_CAUTIONS : []),
  ];
  const confirmPrompts =
    path === "ambiguous_needs_confirm" || dataMissing
      ? [...(entry?.confirmPrompts || []), ...GENERIC_CONFIRM].slice(0, 3)
      : [...(entry?.confirmPrompts || [])].slice(0, 2);

  // Never emit bulb size unless table has an allowlisted hint
  const bulbHint =
    path === "likely_replaceable_bulb" || path === "ambiguous_needs_confirm"
      ? entry?.lowBeamHint ?? null
      : null;
  const highBeamHint =
    path === "likely_replaceable_bulb" || path === "ambiguous_needs_confirm"
      ? entry?.highBeamHint ?? null
      : null;

  if (dataMissing) {
    path = "ambiguous_needs_confirm";
    confidence = "low";
  }

  return {
    path,
    confidence,
    bulbHint,
    highBeamHint,
    cautions: Array.from(new Set(cautions)),
    confirmPrompts: Array.from(new Set(confirmPrompts)),
    entryId: entry?.id ?? null,
    intent,
    playbookSlug: playbookFor(path, intent),
    dataMissing,
  };
}

/** Test helper: table size. */
export function lightingYmmEntryCount(): number {
  return ENTRIES.length;
}
