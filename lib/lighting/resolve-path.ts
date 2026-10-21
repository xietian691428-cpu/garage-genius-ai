/**
 * Resolve educational lighting structure path from YMM (+ optional notes/tags).
 * Never claims VIN-decoded lighting options.
 * W8: structure unconfirmed → path capped ambiguous; bulb hints only after confirm.
 */

import ymmTable from "@/content/lighting/ymm-common.json";
import {
  parseLightingStructureFromText,
  parseReplaceableHousingConfirm,
  parseSealedHousingConfirm,
} from "@/lib/intake/derive";
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
  // Structure must match before recommending replace_* guides
  if (path === "ambiguous_needs_confirm") {
    return "diagnosis_electrical_lights_sensors";
  }
  if (intent === "troubleshoot" || intent === "led_upgrade") {
    return "diagnosis_electrical_lights_sensors";
  }
  if (
    intent === "install_assembly" ||
    path === "likely_sealed_or_integrated_led"
  ) {
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

export type ResolveLightingOptions = {
  /** Extra transcript (recent user turns) for structure confirm phrases. */
  transcriptBlob?: string;
};

/**
 * Resolve lighting path for Chat inject. Returns null if message is not lighting.
 */
export function resolveLightingPath(
  vehicle: VehicleInfo | null | undefined,
  userMessage: string,
  options?: ResolveLightingOptions,
): LightingPathResult | null {
  const blob = [userMessage, options?.transcriptBlob || ""]
    .filter(Boolean)
    .join("\n");
  if (!isLightingIntent(userMessage) && !isLightingIntent(blob)) return null;
  // Prefer current message for intent; fall back to blob
  const intentMsg = isLightingIntent(userMessage) ? userMessage : blob;
  const intent = detectLightingIntentKind(intentMsg);
  const override = vehicle ? noteOverrides(vehicle) : null;
  const entry = vehicle ? matchEntry(vehicle) : null;

  const fromText = parseLightingStructureFromText(blob);
  const userConfirmedReplaceable =
    fromText === "replaceable_bulb" || parseReplaceableHousingConfirm(blob);
  // Prefer replaceable when both fire — assistant copy often says
  // "not a sealed LED module" which still matches sealed patterns.
  const userConfirmedSealed =
    !userConfirmedReplaceable &&
    (fromText === "sealed_or_integrated_led" ||
      parseSealedHousingConfirm(blob));

  let path: LightingStructurePath = "ambiguous_needs_confirm";
  let confidence: LightingPathResult["confidence"] = "low";
  let structureConfirmed = false;

  if (
    userConfirmedReplaceable ||
    override === "likely_replaceable_bulb"
  ) {
    path = "likely_replaceable_bulb";
    confidence = userConfirmedReplaceable ? "high" : "medium";
    structureConfirmed = true;
  } else if (
    userConfirmedSealed ||
    override === "likely_sealed_or_integrated_led"
  ) {
    path = "likely_sealed_or_integrated_led";
    confidence = userConfirmedSealed ? "high" : "medium";
    structureConfirmed = true;
  } else {
    // Table may suggest a weak prior — never promote to confirmed; cap path
    path = "ambiguous_needs_confirm";
    confidence = entry ? "low" : "low";
    structureConfirmed = false;
  }

  const dataMissing = !entry && !override && !structureConfirmed;

  const cautions = [
    ...GENERIC_CAUTIONS,
    ...(entry?.cautions || []),
    ...(intent === "led_upgrade" ? LED_UPGRADE_CAUTIONS : []),
  ];
  const confirmPrompts =
    !structureConfirmed || path === "ambiguous_needs_confirm"
      ? [...(entry?.confirmPrompts || []), ...GENERIC_CONFIRM].slice(0, 3)
      : [...(entry?.confirmPrompts || [])].slice(0, 2);

  // W8: bulb hints only after replaceable structure is confirmed (+ table row)
  const bulbHint =
    structureConfirmed && path === "likely_replaceable_bulb"
      ? entry?.lowBeamHint ?? null
      : null;
  const highBeamHint =
    structureConfirmed && path === "likely_replaceable_bulb"
      ? entry?.highBeamHint ?? null
      : null;

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
