/**
 * Ephemeral intake slots for Chat — derived per request from transcript.
 * Not a second persistence layer; TurnFocus (drift) stays separate.
 */

import type { EvidenceGrade, EvidenceItem } from "@/lib/evidence/grades";

export type LightingStructureSlot =
  | "unknown"
  | "replaceable_bulb"
  | "sealed_or_integrated_led"
  | "confirmed_by_user";

export type LightingFunctionSlot =
  | "low_beam"
  | "high_beam"
  | "drl"
  | "fog"
  | "turn"
  | "mixed"
  | "unknown";

export type HousingConfirmSlot =
  | "unset"
  | "dust_cap_visible"
  | "heatsink_sealed_module"
  | "photo_noted"
  | "photo_assist_dust_cap"
  | "photo_assist_sealed";

export type SideSlot = "left" | "right" | "both" | "na" | "unknown";

export type SuddenOrGradual = "sudden" | "gradual" | "unknown";
export type IntermittentOrConstant = "intermittent" | "constant" | "unknown";

/** Battery / cranking symptom family (W9). */
export type BatteryCrankSymptom =
  | "unknown"
  | "no_crank"
  | "slow_crank"
  | "clicks"
  | "starts_then_dies";

export type YesNoUnknown = "yes" | "no" | "unknown";

/** Brake warning / soft pedal (W10a). */
export type BrakePedalFeel =
  | "unknown"
  | "firm"
  | "soft_spongy"
  | "sinks";

export type BrakeWarningLight =
  | "unknown"
  | "on"
  | "intermittent"
  | "off";

export type BrakeLevelChecked =
  | "unknown"
  | "yes_cold_reservoir_sight"
  | "no";

export type BrakeAfterEvent =
  | "unknown"
  | "recent_pads_work"
  | "fluid_service"
  | "none";

export type IntakeFocusIntent =
  | "none"
  | "lighting"
  | "battery_cranking"
  | "overheat"
  | "brake_warning"
  | "generic_root_cause";

export type IntakeSlots = {
  symptom_summary: string | null;
  when_started: string | null;
  sudden_or_gradual: SuddenOrGradual;
  intermittent_or_constant: IntermittentOrConstant;
  after_event: string | null;
  side: SideSlot;
  conditions: string[];
  already_tried: string | null;
  dtc_list: string[];
  evidence_level: EvidenceGrade;
  /** Lighting-aligned slots (same intake object). */
  lighting_structure: LightingStructureSlot;
  lighting_function: LightingFunctionSlot;
  housing_confirm: HousingConfirmSlot;
  trim_or_package: string | null;
  /** Battery / cranking (W9). */
  battery_symptom: BatteryCrankSymptom;
  lights_dim: YesNoUnknown;
  recent_battery_work: YesNoUnknown;
  parked_days: string | null;
  weather_cold: YesNoUnknown;
  /** Overheat (W9). */
  temp_gauge_or_light: YesNoUnknown;
  steam: YesNoUnknown;
  level_checked_cold: YesNoUnknown;
  recent_cooling_work: YesNoUnknown;
  /** Brake warning (W10a). */
  pedal_feel: BrakePedalFeel;
  brake_warning_light: BrakeWarningLight;
  brake_level_checked: BrakeLevelChecked;
  brake_after_event: BrakeAfterEvent;
  pulls_or_noise: string | null;
};

export type IntakeMissingSlot =
  | "when_started"
  | "intermittent_or_constant"
  | "side"
  | "lighting_structure"
  | "housing_confirm"
  | "battery_symptom"
  | "lights_dim"
  | "temp_gauge_or_light"
  | "steam"
  | "level_checked_cold"
  | "pedal_feel"
  | "brake_warning_light"
  | "brake_level_checked"
  | "brake_after_event";

export type IntakeDeriveResult = {
  slots: IntakeSlots;
  missingCritical: IntakeMissingSlot[];
  evidenceItems: EvidenceItem[];
  focusIntent: IntakeFocusIntent;
  lightingIntent: boolean;
  batteryIntent: boolean;
  overheatIntent: boolean;
  brakeIntent: boolean;
  seekingRootCause: boolean;
  /** Prefer ask-first over long diagnosis dump. */
  preferIntakeQuestions: boolean;
  /** Soft pedal / sinks / warning-on → do-not-drive education. */
  brakeStopDrive: boolean;
};

/** Optional W10b housing assist from vision (ephemeral). */
export type VisionHousingAssist = {
  housing_guess: "dust_cap" | "sealed_heatsink" | "unclear";
  housing_confidence: "high" | "low";
};

export const EMPTY_INTAKE_SLOTS: IntakeSlots = {
  symptom_summary: null,
  when_started: null,
  sudden_or_gradual: "unknown",
  intermittent_or_constant: "unknown",
  after_event: null,
  side: "unknown",
  conditions: [],
  already_tried: null,
  dtc_list: [],
  evidence_level: "UNVERIFIED",
  lighting_structure: "unknown",
  lighting_function: "unknown",
  housing_confirm: "unset",
  trim_or_package: null,
  battery_symptom: "unknown",
  lights_dim: "unknown",
  recent_battery_work: "unknown",
  parked_days: null,
  weather_cold: "unknown",
  temp_gauge_or_light: "unknown",
  steam: "unknown",
  level_checked_cold: "unknown",
  recent_cooling_work: "unknown",
  pedal_feel: "unknown",
  brake_warning_light: "unknown",
  brake_level_checked: "unknown",
  brake_after_event: "unknown",
  pulls_or_noise: null,
};
