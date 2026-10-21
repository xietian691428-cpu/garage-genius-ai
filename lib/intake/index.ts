export {
  deriveIntake,
  intakeChipPrompts,
  isBatteryCrankingIntent,
  isOverheatIntent,
  parseLightingStructureFromText,
  parseReplaceableHousingConfirm,
  parseSealedHousingConfirm,
} from "@/lib/intake/derive";
export {
  formatIntakeStateBlock,
  summarizeIntakeForShopNote,
} from "@/lib/intake/format-blocks";
export { applyW9OutputGuards } from "@/lib/intake/w9-output-gates";
export type {
  BatteryCrankSymptom,
  HousingConfirmSlot,
  IntakeDeriveResult,
  IntakeFocusIntent,
  IntakeMissingSlot,
  IntakeSlots,
  LightingFunctionSlot,
  LightingStructureSlot,
  SideSlot,
  YesNoUnknown,
} from "@/lib/intake/types";
export { EMPTY_INTAKE_SLOTS } from "@/lib/intake/types";
