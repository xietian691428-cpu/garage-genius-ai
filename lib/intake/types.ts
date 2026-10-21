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
  | "photo_noted";

export type SideSlot = "left" | "right" | "both" | "na" | "unknown";

export type SuddenOrGradual = "sudden" | "gradual" | "unknown";
export type IntermittentOrConstant = "intermittent" | "constant" | "unknown";

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
};

export type IntakeMissingSlot =
  | "when_started"
  | "intermittent_or_constant"
  | "side"
  | "lighting_structure"
  | "housing_confirm";

export type IntakeDeriveResult = {
  slots: IntakeSlots;
  missingCritical: IntakeMissingSlot[];
  evidenceItems: EvidenceItem[];
  lightingIntent: boolean;
  seekingRootCause: boolean;
  /** Prefer ask-first over long diagnosis dump. */
  preferIntakeQuestions: boolean;
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
};
