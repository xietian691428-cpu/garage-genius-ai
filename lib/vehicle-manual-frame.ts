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
  if (!capOk && !viscOk) return "";
  const lines = [
    "[GARAGE_PROFILE_FLUIDS]",
    capOk ? `oil_capacity: ${fluids.oilCapacity}` : null,
    viscOk ? `oil_viscosity: ${fluids.oilViscosity}` : null,
    "source=user_manual_confirmed",
    fluids.oilSpecsConfirmedAt
      ? `confirmed_at: ${fluids.oilSpecsConfirmedAt}`
      : null,
    GARAGE_PROFILE_MANUAL_SOURCE_LINE,
    "Cite as Garage profile (from your manual). Still require under-hood fill-cap verify.",
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
    "- Stop if: existing [STOP_RULE] / drive-safety / exit-under / steam / soft brakes still win — even if a manual chunk was retrieved.",
    "Evidence order: safety stop-rules > unsafe OBD / live [OBD_STATE] > [USER_MANUAL] > [GARAGE_PROFILE_FLUIDS] > model guess.",
    "Forbidden: invent qt / L / ft-lb / required 0W-xx not in those blocks. Forbidden: “based on live OBD” unless source=live.",
    clearCodes
      ? "Clear-code ask: educate not to clear codes only to pass inspection. A maintenance table in the manual is not a reason to erase DTCs."
      : null,
    lighting,
    oilBind,
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
  return {
    oilCapacity: garageCap || fromHits.oilCapacity || null,
    oilViscosity: garageVisc || fromHits.oilViscosity || null,
    torqueSpec: fromHits.torqueSpec || null,
  };
}
