export {
  applyVisionHousingAssist,
  deriveIntake,
  intakeChipPrompts,
  isBatteryCrankingIntent,
  isBrakeWarningIntent,
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
export { applyW10OutputGuards } from "@/lib/intake/w10-output-gates";
export type {
  BatteryCrankSymptom,
  BrakeAfterEvent,
  BrakeLevelChecked,
  BrakePedalFeel,
  BrakeWarningLight,
  HousingConfirmSlot,
  IntakeDeriveResult,
  IntakeFocusIntent,
  IntakeMissingSlot,
  IntakeSlots,
  LightingFunctionSlot,
  LightingStructureSlot,
  SideSlot,
  VisionHousingAssist,
  YesNoUnknown,
} from "@/lib/intake/types";
export { EMPTY_INTAKE_SLOTS } from "@/lib/intake/types";
