/**
 * Exterior lighting path types — education only, never VIN-decoded certainty.
 */

export type LightingStructurePath =
  | "likely_replaceable_bulb"
  | "likely_sealed_or_integrated_led"
  | "ambiguous_needs_confirm";

export type LightingConfidence = "low" | "medium" | "high";

export type LightingIntentKind =
  | "buy_or_path"
  | "install_bulb"
  | "install_assembly"
  | "troubleshoot"
  | "led_upgrade"
  | "lens_fog"
  | "general";

export type LightingYmmEntry = {
  id: string;
  yearMin: number;
  yearMax: number;
  make: string;
  modelIncludes: string[];
  path: LightingStructurePath;
  confidence: LightingConfidence;
  /** Same YMM can be halogen or LED by trim — never emit bulb size until structure confirmed. */
  multiConfig?: boolean;
  lowBeamHint?: string;
  highBeamHint?: string;
  cautions?: string[];
  confirmPrompts?: string[];
};

export type LightingPathResult = {
  path: LightingStructurePath;
  confidence: LightingConfidence;
  /** Weak table hint only — never invent outside table. */
  bulbHint?: string | null;
  highBeamHint?: string | null;
  cautions: string[];
  confirmPrompts: string[];
  entryId?: string | null;
  intent: LightingIntentKind;
  playbookSlug:
    | "lighting_replace_bulb"
    | "lighting_replace_assembly_basic"
    | "lighting_lens_restore_edu"
    | "diagnosis_electrical_lights_sensors";
  /** True when YMM had no table row — generic education only. */
  dataMissing: boolean;
  /** Table row marks halogen/LED fork for this YMM. */
  multiConfig: boolean;
};

export type LightingChip = {
  id: string;
  label: string;
  prompt: string;
  playbookSlug?: LightingPathResult["playbookSlug"];
};
