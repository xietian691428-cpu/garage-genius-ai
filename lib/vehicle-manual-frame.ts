/**
 * Same-frame Chat injection: [OBD_STATE] × [USER_MANUAL] × garage fluids × skeleton.
 * Safety stop-rules still outrank this block.
 */

import type { SpecAnchorContext } from "@/lib/spec-discipline";
import { extractDtcCodes, extractDtcCodesFromAny } from "@/lib/dtc-parse";
import {
  extractManualSpecAllowlist,
  formatUserManualForPrompt,
  type ManualChunkHit,
} from "@/lib/vehicle-manuals";
import {
  isClearCodesQuestion,
  wantsRepairFrame,
  type ManualIntent,
} from "@/lib/vehicle-manual-intent";
import {
  garageFluidCiteLabel,
  isOwnerGarageFluidSource,
} from "@/lib/vehicle-manual-extract";

export const GARAGE_PROFILE_MANUAL_SOURCE_LINE =
  "Source: Garage profile (from your manual)";

export const GARAGE_PROFILE_ENTERED_SOURCE_LINE =
  "Source: Garage profile (you entered)";

export const GARAGE_PROFILE_MUST_USE_LINE =
  "MUST USE: when the owner asks about a fluid listed above, quote the exact garage value and name its Source label. Not OEM-certified by Garage Genius — still verify under-hood fill cap / cold reservoir. Do not invent a different qt/L/viscosity/DOT/ATF number.";

export type ObdStateSource = "live" | "user_provided" | "none";

export type ObdStateForPrompt = {
  source: ObdStateSource;
  codes: string[];
  extraUserCodes: string[];
  cel: "on" | "off" | "unknown";
  readiness: string;
  capturedAt: string | null;
};

export type VitalsSnapshotLike = {
  dtc_codes?: unknown;
  source?: string | null;
  snapshot_at?: string | null;
  notes?: string | null;
};

export type GarageFluidsForPrompt = {
  oilCapacity?: string | null;
  oilViscosity?: string | null;
  oilCapacitySource?: string | null;
  oilViscositySource?: string | null;
  oilSpecsConfirmedAt?: string | null;
  coolantSpecText?: string | null;
  coolantCapacityText?: string | null;
  coolantMixText?: string | null;
  coolantSpecSource?: string | null;
  coolantCapacitySource?: string | null;
  coolantMixSource?: string | null;
  coolantSpecsConfirmedAt?: string | null;
  brakeFluidSpecText?: string | null;
  brakeFluidNotesText?: string | null;
  brakeFluidSpecSource?: string | null;
  brakeFluidNotesSource?: string | null;
  brakeFluidSpecsConfirmedAt?: string | null;
  atfSpecText?: string | null;
  atfCapacityText?: string | null;
  atfNotesText?: string | null;
  atfSpecSource?: string | null;
  atfCapacitySource?: string | null;
  atfNotesSource?: string | null;
  atfSpecsConfirmedAt?: string | null;
  transmissionKind?: "atf" | "cvt" | "unknown" | null;
};

function codesFromVitals(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return extractDtcCodesFromAny(
      raw.map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "code" in item) {
          return String((item as { code?: unknown }).code || "");
        }
        return "";
      }),
    );
  }
  if (typeof raw === "string") return extractDtcCodes(raw);
  return [];
}

export function resolveObdStateForPrompt(opts: {
  vitals?: VitalsSnapshotLike | null;
  userText: string;
  hasLiveAdapter: boolean;
}): ObdStateForPrompt {
  const userCodes = extractDtcCodes(opts.userText);
  const vitalsCodes = codesFromVitals(opts.vitals?.dtc_codes);
  const vitalsSource = (opts.vitals?.source || "").toLowerCase();
  const live =
    opts.hasLiveAdapter && vitalsSource === "obd" && Boolean(opts.vitals);

  const notes = opts.vitals?.notes || "";
  const celOn = /\b(mil|cel|check engine)\b.{0,12}\bon\b/i.test(notes);
  const celOff = /\b(mil|cel|check engine)\b.{0,12}\boff\b/i.test(notes);
  const readinessHit = notes.match(/\breadiness[:\s]+([a-z0-9 ,.-]{3,40})/i);

  if (live) {
    const extra = userCodes.filter((c) => !vitalsCodes.includes(c));
    return {
      source: "live",
      codes: vitalsCodes,
      extraUserCodes: extra,
      cel: celOn ? "on" : celOff ? "off" : vitalsCodes.length ? "unknown" : "unknown",
      readiness: readinessHit?.[1]?.trim() || "unknown",
      capturedAt: opts.vitals?.snapshot_at ?? null,
    };
  }

  const provided = [...new Set([...vitalsCodes, ...userCodes])];
  if (provided.length) {
    return {
      source: "user_provided",
      codes: provided,
      extraUserCodes: [],
      cel: celOn ? "on" : "unknown",
      readiness: "not connected",
      capturedAt: opts.vitals?.snapshot_at ?? null,
    };
  }

  return {
    source: "none",
    codes: [],
    extraUserCodes: [],
    cel: "unknown",
    readiness: "not connected",
    capturedAt: null,
  };
}

export function formatObdStateForPrompt(state: ObdStateForPrompt): string {
  const codeLine =
    state.codes.length > 0 ? state.codes.join(", ") : "none";
  const extra =
    state.extraUserCodes.length > 0
      ? `\nadditional_user_provided: ${state.extraUserCodes.join(", ")}`
      : "";
  const liveRule =
    state.source === "live"
      ? "You may cite these as Live OBD (this vehicle). Do not invent PIDs or freeze-frame."
      : 'Do not write "based on live OBD" or "live OBD readings". Codes here are user-provided or absent.';
  return [
    "[OBD_STATE]",
    `source=${state.source}`,
    `codes: ${codeLine}`,
    `CEL: ${state.cel}`,
    `readiness: ${state.readiness}`,
    state.capturedAt ? `captured_at: ${state.capturedAt}` : null,
    extra.trim() || null,
    liveRule,
  ]
    .filter(Boolean)
    .join("\n");
}

function ownerFluidOk(
  value: string | null | undefined,
  source: string | null | undefined,
): boolean {
  return Boolean(value?.trim()) && isOwnerGarageFluidSource(source);
}

function fieldCiteLine(
  fieldKey: string,
  source: string | null | undefined,
): string {
  return `${fieldKey}_cite: ${garageFluidCiteLabel(source)}`;
}

export function formatGarageProfileFluidsForPrompt(
  fluids: GarageFluidsForPrompt,
): string {
  const capOk = ownerFluidOk(fluids.oilCapacity, fluids.oilCapacitySource);
  const viscOk = ownerFluidOk(fluids.oilViscosity, fluids.oilViscositySource);
  const coolSpecOk = ownerFluidOk(
    fluids.coolantSpecText,
    fluids.coolantSpecSource,
  );
  const coolCapOk = ownerFluidOk(
    fluids.coolantCapacityText,
    fluids.coolantCapacitySource,
  );
  const coolMixOk = ownerFluidOk(fluids.coolantMixText, fluids.coolantMixSource);
  const brakeSpecOk = ownerFluidOk(
    fluids.brakeFluidSpecText,
    fluids.brakeFluidSpecSource,
  );
  const brakeNotesOk = ownerFluidOk(
    fluids.brakeFluidNotesText,
    fluids.brakeFluidNotesSource,
  );
  const atfSpecOk = ownerFluidOk(fluids.atfSpecText, fluids.atfSpecSource);
  const atfCapOk = ownerFluidOk(fluids.atfCapacityText, fluids.atfCapacitySource);
  const atfNotesOk = ownerFluidOk(fluids.atfNotesText, fluids.atfNotesSource);
  const transmissionKind =
    fluids.transmissionKind === "atf" ||
    fluids.transmissionKind === "cvt" ||
    fluids.transmissionKind === "unknown"
      ? fluids.transmissionKind
      : null;
  const atfAny = atfSpecOk || atfCapOk || atfNotesOk;
  if (
    !capOk &&
    !viscOk &&
    !coolSpecOk &&
    !coolCapOk &&
    !coolMixOk &&
    !brakeSpecOk &&
    !brakeNotesOk &&
    !atfAny
  ) {
    return "";
  }

  const sources = [
    capOk ? fluids.oilCapacitySource : null,
    viscOk ? fluids.oilViscositySource : null,
    coolSpecOk ? fluids.coolantSpecSource : null,
    coolCapOk ? fluids.coolantCapacitySource : null,
    coolMixOk ? fluids.coolantMixSource : null,
    brakeSpecOk ? fluids.brakeFluidSpecSource : null,
    brakeNotesOk ? fluids.brakeFluidNotesSource : null,
    atfSpecOk ? fluids.atfSpecSource : null,
    atfCapOk ? fluids.atfCapacitySource : null,
    atfNotesOk ? fluids.atfNotesSource : null,
  ].filter(Boolean) as string[];
  const anyManual = sources.some((s) => s === "user_manual_confirmed");
  const anyEntered = sources.some((s) => s === "user_entered");

  const cvtLines =
    atfAny && transmissionKind === "cvt"
      ? [
          "This vehicle uses CVT-specific fluid — cite as CVT fluid / CVT-specific (never title it as generic ATF alone).",
          "Never recommend substituting conventional ATF (Dexron/Mercon/etc.) for CVT fluid. Never say any ATF is fine.",
        ]
      : atfAny && transmissionKind === "atf"
        ? [
            "Transmission fluid class: conventional ATF / automatic transmission fluid — still quote the exact garage spec text.",
          ]
        : atfAny
          ? [
              "Transmission fluid class unknown — quote the garage spec text only; do not invent ATF vs CVT or suggest Dexron/Mercon substitutes.",
            ]
          : [];
  const lines = [
    "[GARAGE_PROFILE_FLUIDS]",
    capOk ? `oil_capacity: ${fluids.oilCapacity}` : null,
    capOk ? fieldCiteLine("oil_capacity", fluids.oilCapacitySource) : null,
    viscOk ? `oil_viscosity: ${fluids.oilViscosity}` : null,
    viscOk ? fieldCiteLine("oil_viscosity", fluids.oilViscositySource) : null,
    coolSpecOk ? `coolant_spec: ${fluids.coolantSpecText}` : null,
    coolSpecOk ? fieldCiteLine("coolant_spec", fluids.coolantSpecSource) : null,
    coolCapOk ? `coolant_capacity: ${fluids.coolantCapacityText}` : null,
    coolCapOk
      ? fieldCiteLine("coolant_capacity", fluids.coolantCapacitySource)
      : null,
    coolMixOk ? `coolant_mix: ${fluids.coolantMixText}` : null,
    coolMixOk ? fieldCiteLine("coolant_mix", fluids.coolantMixSource) : null,
    brakeSpecOk ? `brake_fluid_spec: ${fluids.brakeFluidSpecText}` : null,
    brakeSpecOk
      ? fieldCiteLine("brake_fluid_spec", fluids.brakeFluidSpecSource)
      : null,
    brakeNotesOk ? `brake_fluid_notes: ${fluids.brakeFluidNotesText}` : null,
    brakeNotesOk
      ? fieldCiteLine("brake_fluid_notes", fluids.brakeFluidNotesSource)
      : null,
    atfAny && transmissionKind
      ? `transmission_kind: ${transmissionKind}`
      : null,
    atfSpecOk ? `atf_spec: ${fluids.atfSpecText}` : null,
    atfSpecOk ? fieldCiteLine("atf_spec", fluids.atfSpecSource) : null,
    atfCapOk ? `atf_capacity: ${fluids.atfCapacityText}` : null,
    atfCapOk ? fieldCiteLine("atf_capacity", fluids.atfCapacitySource) : null,
    atfNotesOk ? `atf_notes: ${fluids.atfNotesText}` : null,
    atfNotesOk ? fieldCiteLine("atf_notes", fluids.atfNotesSource) : null,
    anyManual && !anyEntered
      ? "source=user_manual_confirmed"
      : anyEntered && !anyManual
        ? "source=user_entered"
        : "source=owner_garage_mixed",
    fluids.oilSpecsConfirmedAt
      ? `oil_confirmed_at: ${fluids.oilSpecsConfirmedAt}`
      : null,
    fluids.coolantSpecsConfirmedAt
      ? `coolant_confirmed_at: ${fluids.coolantSpecsConfirmedAt}`
      : null,
    fluids.brakeFluidSpecsConfirmedAt
      ? `brake_fluid_confirmed_at: ${fluids.brakeFluidSpecsConfirmedAt}`
      : null,
    fluids.atfSpecsConfirmedAt
      ? `atf_confirmed_at: ${fluids.atfSpecsConfirmedAt}`
      : null,
    anyManual ? GARAGE_PROFILE_MANUAL_SOURCE_LINE : null,
    anyEntered ? GARAGE_PROFILE_ENTERED_SOURCE_LINE : null,
    GARAGE_PROFILE_MUST_USE_LINE,
    "Still require under-hood fill-cap / cold-reservoir verify. Not OEM-certified by Garage Genius.",
    "Never open a hot coolant reservoir. Steam / red temp gauge → stop driving / tow education first.",
    "Brake fluid: visual level check when cold/safe only. Do not instruct bleeding, opening hydraulic lines, or DIY ABS work — recommend professional service for soft pedal or fluid service beyond a safe visual check.",
    "ATF/CVT: never treat as engine oil. Do not invent drain-and-fill procedures; recommend professional service when equipment-heavy. No absolute “lifetime fluid never change” or “replace ATF now” without evidence.",
    ...cvtLines,
  ];
  return lines.filter(Boolean).join("\n");
}

export function formatRepairFrameForPrompt(opts: {
  intent: ManualIntent;
  userText: string;
  hasUserManual: boolean;
  hasGarageFluids: boolean;
  obdSource: ObdStateSource;
}): string {
  if (!wantsRepairFrame(opts.intent) && !opts.hasUserManual && !opts.hasGarageFluids) {
    return "";
  }
  const clearCodes = isClearCodesQuestion(opts.userText);
  const lighting =
    opts.intent === "lighting"
      ? "Lighting: a retrieved manual page does **not** skip dust-cap vs sealed structure confirm. No invented H11/9005."
      : null;
  const oilBind =
    opts.intent === "fluids_oil"
      ? opts.hasGarageFluids
        ? "Oil-change: MUST quote oil_capacity / oil_viscosity from [GARAGE_PROFILE_FLUIDS] when listed, and cite that field’s Source label (Garage profile (from your manual) / Your confirmed manual spec, or Garage profile (you entered)). Do not invent a different qt/viscosity. Do not bind unrelated DTCs to the oil job."
        : "Oil-change: cite capacity/viscosity only from [USER_MANUAL] or [GARAGE_PROFILE_FLUIDS]. If neither lists a figure this turn, do not invent quarts — tell the owner to confirm on the fill cap / manual / garage save. Do not bind unrelated DTCs to the oil job."
      : null;
  const coolantBind =
    opts.intent === "fluids_coolant"
      ? opts.hasGarageFluids
        ? "Coolant: MUST quote coolant_spec / coolant_capacity / coolant_mix from [GARAGE_PROFILE_FLUIDS] when listed, with Source label. Never invent brand, freeze point, or liters. Never open a hot coolant reservoir."
        : "Coolant: cite type/capacity/mix only from [USER_MANUAL] or [GARAGE_PROFILE_FLUIDS]. If neither lists a figure this turn, do not invent liters — cold reservoir / manual only. Never open a hot coolant reservoir."
      : null;
  const overheatBind =
    opts.intent === "overheat"
      ? "Overheat: Stop if (steam / red gauge / do not drive / never open a hot cap) MUST come before any manual capacity or mixture detail. Manual / garage may only add cold-check / after-cool guidance when present — still cite Source."
      : null;
  const brakeFluidBind =
    opts.intent === "fluids_brake"
      ? opts.hasGarageFluids
        ? "Brake fluid: MUST quote brake_fluid_spec / notes from [GARAGE_PROFILE_FLUIDS] when listed, with Source label. Never invent DOT grade. Visual cold reservoir level only — never bleed brakes or open lines."
        : "Brake fluid: cite DOT type / notes only from [USER_MANUAL] or [GARAGE_PROFILE_FLUIDS]. If neither lists DOT this turn, do not invent grade. Visual cold reservoir level only — never bleed brakes or open lines."
      : null;
  const brakeWarningBind =
    opts.intent === "brake_warning"
      ? "Brake warning / soft pedal: STOP / do-not-drive / tow education FIRST (drive-safety). A garage/manual DOT line may be cited after stop rules — never teach bleeding, opening hydraulic lines, or DIY ABS."
      : null;
  const atfBind =
    opts.intent === "fluids_atf"
      ? opts.hasGarageFluids
        ? "ATF/CVT: MUST quote transmission_kind + atf_* from [GARAGE_PROFILE_FLUIDS] with Source label. Never treat as engine oil quarts. If transmission_kind=cvt: say CVT fluid / CVT-specific; never recommend Dexron/Mercon/conventional ATF as a substitute; never say any ATF is fine. Do not invent drain-and-fill steps; prefer shop when equipment-heavy. No absolute lifetime-never / replace-now claims."
        : "ATF/CVT: cite type/capacity only from [USER_MANUAL] or [GARAGE_PROFILE_FLUIDS] transmission_kind + atf_* fields. If neither lists a figure this turn, do not invent ATF/CVT type or liters. Never treat transmission fluid as engine oil quarts. If transmission_kind=cvt: say CVT fluid / CVT-specific; never recommend Dexron/Mercon/conventional ATF as a substitute; never say any ATF is fine. Do not invent drain-and-fill steps; prefer shop when equipment-heavy. No absolute lifetime-never / replace-now claims."
      : null;
  const dtcFirst =
    opts.intent === "dtc_related"
      ? "Diagnosis: list [OBD_STATE] codes first, then any [USER_MANUAL] hit, then local check_order. Never “Replace converter now”."
      : null;
  return [
    "[MANUAL_REPLY_FRAME]",
    "For maintenance / spec / diagnosis this turn, prefer this educational shape:",
    "- Now: OBD/state from [OBD_STATE] only (none → say not connected; never fake live).",
    "- Per your manual or garage profile: quote numbers/steps only if they appear in [USER_MANUAL] or [GARAGE_PROFILE_FLUIDS] this turn. Label Your manual vs Garage profile (from your manual) / Your confirmed manual spec vs Garage profile (you entered).",
    "- Do next: 2–5 ordered steps (align with [DTC_REF] check_order when present).",
    "- Stop if: existing [STOP_RULE] / drive-safety / exit-under / steam / soft brakes still win — even if a manual chunk was retrieved. Never teach opening a hot coolant reservoir. Never instruct brake bleeding or opening hydraulic lines.",
    "Evidence order: safety stop-rules > unsafe OBD / live [OBD_STATE] > [USER_MANUAL] > [GARAGE_PROFILE_FLUIDS] > model guess.",
    "Forbidden: invent qt / L / ft-lb / required 0W-xx / coolant liters or brands / DOT grades / ATF type or liters not in those blocks. Forbidden: use atf_capacity as engine oil quarts. Forbidden: “based on live OBD” unless source=live.",
    clearCodes
      ? "Clear-code ask: educate not to clear codes only to pass inspection. A maintenance table in the manual is not a reason to erase DTCs."
      : null,
    lighting,
    oilBind,
    coolantBind,
    overheatBind,
    brakeFluidBind,
    brakeWarningBind,
    atfBind,
    dtcFirst,
    !opts.hasUserManual
      ? "No [USER_MANUAL] this turn — do not pretend you read their PDF."
      : null,
    opts.hasGarageFluids
      ? "Confirmed garage fluids are present — for any listed field that answers this ask, MUST quote the exact value and cite its Source label. Do not skip the citation."
      : "No confirmed garage fluids this turn — do not invent oil/coolant/brake/ATF numbers; tell the owner to confirm on the fill cap / manual or save specs to the garage.",
    `OBD source this turn: ${opts.obdSource}.`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function assembleManualSameFrame(opts: {
  intent: ManualIntent;
  userText: string;
  obd: ObdStateForPrompt;
  manualHits: ManualChunkHit[];
  garageFluids: GarageFluidsForPrompt;
}): string {
  const manualBlock = formatUserManualForPrompt(opts.manualHits);
  const garageBlock = formatGarageProfileFluidsForPrompt(opts.garageFluids);
  const frame = formatRepairFrameForPrompt({
    intent: opts.intent,
    userText: opts.userText,
    hasUserManual: Boolean(manualBlock),
    hasGarageFluids: Boolean(garageBlock),
    obdSource: opts.obd.source,
  });
  return [
    formatObdStateForPrompt(opts.obd),
    manualBlock,
    garageBlock,
    frame,
  ]
    .filter((s) => s?.trim())
    .join("\n\n");
}

/**
 * Spec allowlist for this turn.
 * Pending extracts never unlock. Retrieved hits and confirmed garage fluids do.
 * Oil vs ATF capacity stay isolated by intent when known (never cross-unlock).
 */
export function buildManualSpecAnchors(opts: {
  retrievedHits: ManualChunkHit[];
  garage: GarageFluidsForPrompt;
  pendingExtracts?: Array<{ field: string; value: string }>;
  /** When set, oil and ATF capacities do not cross-unlock each other. */
  intent?: ManualIntent | null;
}): SpecAnchorContext {
  void opts.pendingExtracts;
  const fromHits = opts.retrievedHits.length
    ? extractManualSpecAllowlist(opts.retrievedHits)
    : {};
  // Owner-trusted garage only (manual-confirmed or user-entered). Never unlock vcdb/curated.
  const garageCap = ownerFluidOk(
    opts.garage.oilCapacity,
    opts.garage.oilCapacitySource,
  )
    ? opts.garage.oilCapacity?.trim() || null
    : null;
  const garageVisc = ownerFluidOk(
    opts.garage.oilViscosity,
    opts.garage.oilViscositySource,
  )
    ? opts.garage.oilViscosity?.trim() || null
    : null;
  const garageCoolCap = ownerFluidOk(
    opts.garage.coolantCapacityText,
    opts.garage.coolantCapacitySource,
  )
    ? opts.garage.coolantCapacityText?.trim() || null
    : null;
  const garageBrakeSpec = ownerFluidOk(
    opts.garage.brakeFluidSpecText,
    opts.garage.brakeFluidSpecSource,
  )
    ? opts.garage.brakeFluidSpecText?.trim() || null
    : null;
  const garageAtfSpec = ownerFluidOk(
    opts.garage.atfSpecText,
    opts.garage.atfSpecSource,
  )
    ? opts.garage.atfSpecText?.trim() || null
    : null;
  const garageAtfCap = ownerFluidOk(
    opts.garage.atfCapacityText,
    opts.garage.atfCapacitySource,
  )
    ? opts.garage.atfCapacityText?.trim() || null
    : null;
  const oilTurn = opts.intent === "fluids_oil";
  const atfTurn = opts.intent === "fluids_atf";
  return {
    oilCapacity: atfTurn
      ? null
      : garageCap || fromHits.oilCapacity || null,
    oilViscosity: atfTurn
      ? null
      : garageVisc || fromHits.oilViscosity || null,
    coolantCapacity: garageCoolCap || fromHits.coolantCapacity || null,
    brakeFluidSpec: garageBrakeSpec || fromHits.brakeFluidSpec || null,
    atfSpec: oilTurn ? null : garageAtfSpec || fromHits.atfSpec || null,
    atfCapacity: oilTurn
      ? null
      : garageAtfCap || fromHits.atfCapacity || null,
    torqueSpec: fromHits.torqueSpec || null,
  };
}
