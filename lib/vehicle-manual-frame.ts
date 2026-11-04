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
import { isManualConfirmedSource } from "@/lib/vehicle-manual-extract";

export const GARAGE_PROFILE_MANUAL_SOURCE_LINE =
  "Source: Garage profile (from your manual)";

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

export function formatGarageProfileFluidsForPrompt(
  fluids: GarageFluidsForPrompt,
): string {
  const capOk =
    Boolean(fluids.oilCapacity?.trim()) &&
    isManualConfirmedSource(fluids.oilCapacitySource);
  const viscOk =
    Boolean(fluids.oilViscosity?.trim()) &&
    isManualConfirmedSource(fluids.oilViscositySource);
  const coolSpecOk =
    Boolean(fluids.coolantSpecText?.trim()) &&
    isManualConfirmedSource(fluids.coolantSpecSource);
  const coolCapOk =
    Boolean(fluids.coolantCapacityText?.trim()) &&
    isManualConfirmedSource(fluids.coolantCapacitySource);
  const coolMixOk =
    Boolean(fluids.coolantMixText?.trim()) &&
    isManualConfirmedSource(fluids.coolantMixSource);
  const brakeSpecOk =
    Boolean(fluids.brakeFluidSpecText?.trim()) &&
    isManualConfirmedSource(fluids.brakeFluidSpecSource);
  const brakeNotesOk =
    Boolean(fluids.brakeFluidNotesText?.trim()) &&
    isManualConfirmedSource(fluids.brakeFluidNotesSource);
  if (
    !capOk &&
    !viscOk &&
    !coolSpecOk &&
    !coolCapOk &&
    !coolMixOk &&
    !brakeSpecOk &&
    !brakeNotesOk
  ) {
    return "";
  }
  const lines = [
    "[GARAGE_PROFILE_FLUIDS]",
    capOk ? `oil_capacity: ${fluids.oilCapacity}` : null,
    viscOk ? `oil_viscosity: ${fluids.oilViscosity}` : null,
    coolSpecOk ? `coolant_spec: ${fluids.coolantSpecText}` : null,
    coolCapOk ? `coolant_capacity: ${fluids.coolantCapacityText}` : null,
    coolMixOk ? `coolant_mix: ${fluids.coolantMixText}` : null,
    brakeSpecOk ? `brake_fluid_spec: ${fluids.brakeFluidSpecText}` : null,
    brakeNotesOk ? `brake_fluid_notes: ${fluids.brakeFluidNotesText}` : null,
    "source=user_manual_confirmed",
    fluids.oilSpecsConfirmedAt
      ? `oil_confirmed_at: ${fluids.oilSpecsConfirmedAt}`
      : null,
    fluids.coolantSpecsConfirmedAt
      ? `coolant_confirmed_at: ${fluids.coolantSpecsConfirmedAt}`
      : null,
    fluids.brakeFluidSpecsConfirmedAt
      ? `brake_fluid_confirmed_at: ${fluids.brakeFluidSpecsConfirmedAt}`
      : null,
    GARAGE_PROFILE_MANUAL_SOURCE_LINE,
    "Cite as Garage profile (from your manual). Still require under-hood fill-cap / cold-reservoir verify.",
    "Never open a hot coolant reservoir. Steam / red temp gauge → stop driving / tow education first.",
    "Brake fluid: visual level check when cold/safe only. Do not instruct bleeding, opening hydraulic lines, or DIY ABS work — recommend professional service for soft pedal or fluid service beyond a safe visual check.",
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
      ? "Oil-change: cite capacity/viscosity only from [USER_MANUAL] or [GARAGE_PROFILE_FLUIDS]. Do not bind unrelated DTCs to the oil job."
      : null;
  const coolantBind =
    opts.intent === "fluids_coolant"
      ? "Coolant: cite type/capacity/mix only from [USER_MANUAL] or [GARAGE_PROFILE_FLUIDS]. Never invent brand, freeze point, or liters. Never open a hot coolant reservoir."
      : null;
  const overheatBind =
    opts.intent === "overheat"
      ? "Overheat: Stop if (steam / red gauge / do not drive / never open a hot cap) MUST come before any manual capacity or mixture detail. Manual may only add cold-check / after-cool guidance when present."
      : null;
  const brakeFluidBind =
    opts.intent === "fluids_brake"
      ? "Brake fluid: cite DOT type / notes only from [USER_MANUAL] or [GARAGE_PROFILE_FLUIDS]. Never invent DOT grade. Visual cold reservoir level only — never bleed brakes or open lines."
      : null;
  const brakeWarningBind =
    opts.intent === "brake_warning"
      ? "Brake warning / soft pedal: STOP / do-not-drive / tow education FIRST (drive-safety). A manual DOT line may be cited after stop rules — never teach bleeding, opening hydraulic lines, or DIY ABS."
      : null;
  const dtcFirst =
    opts.intent === "dtc_related"
      ? "Diagnosis: list [OBD_STATE] codes first, then any [USER_MANUAL] hit, then local check_order. Never “Replace converter now”."
      : null;
  return [
    "[MANUAL_REPLY_FRAME]",
    "For maintenance / spec / diagnosis this turn, prefer this educational shape:",
    "- Now: OBD/state from [OBD_STATE] only (none → say not connected; never fake live).",
    "- Per your manual or garage profile: quote numbers/steps only if they appear in [USER_MANUAL] or [GARAGE_PROFILE_FLUIDS] this turn. Label Your manual vs Garage profile (from your manual).",
    "- Do next: 2–5 ordered steps (align with [DTC_REF] check_order when present).",
    "- Stop if: existing [STOP_RULE] / drive-safety / exit-under / steam / soft brakes still win — even if a manual chunk was retrieved. Never teach opening a hot coolant reservoir. Never instruct brake bleeding or opening hydraulic lines.",
    "Evidence order: safety stop-rules > unsafe OBD / live [OBD_STATE] > [USER_MANUAL] > [GARAGE_PROFILE_FLUIDS] > model guess.",
    "Forbidden: invent qt / L / ft-lb / required 0W-xx / coolant liters or brands / DOT grades not in those blocks. Forbidden: “based on live OBD” unless source=live.",
    clearCodes
      ? "Clear-code ask: educate not to clear codes only to pass inspection. A maintenance table in the manual is not a reason to erase DTCs."
      : null,
    lighting,
    oilBind,
    coolantBind,
    overheatBind,
    brakeFluidBind,
    brakeWarningBind,
    dtcFirst,
    !opts.hasUserManual
      ? "No [USER_MANUAL] this turn — do not pretend you read their PDF."
      : null,
    !opts.hasGarageFluids
      ? "No confirmed garage fluids from the manual this turn."
      : null,
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
 */
export function buildManualSpecAnchors(opts: {
  retrievedHits: ManualChunkHit[];
  garage: GarageFluidsForPrompt;
  pendingExtracts?: Array<{ field: string; value: string }>;
}): SpecAnchorContext {
  void opts.pendingExtracts;
  const fromHits = opts.retrievedHits.length
    ? extractManualSpecAllowlist(opts.retrievedHits)
    : {};
  const garageCap = opts.garage.oilCapacity?.trim() || null;
  const garageVisc = opts.garage.oilViscosity?.trim() || null;
  const garageCoolCap =
    isManualConfirmedSource(opts.garage.coolantCapacitySource)
      ? opts.garage.coolantCapacityText?.trim() || null
      : null;
  const garageBrakeSpec =
    isManualConfirmedSource(opts.garage.brakeFluidSpecSource)
      ? opts.garage.brakeFluidSpecText?.trim() || null
      : null;
  return {
    oilCapacity: garageCap || fromHits.oilCapacity || null,
    oilViscosity: garageVisc || fromHits.oilViscosity || null,
    coolantCapacity: garageCoolCap || fromHits.coolantCapacity || null,
    brakeFluidSpec: garageBrakeSpec || fromHits.brakeFluidSpec || null,
    torqueSpec: fromHits.torqueSpec || null,
  };
}
