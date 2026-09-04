/**
 * Guide ↔ Chat handoff (entry + inject only).
 * Does not change CoachScenarioPlayer step matching / risk_confirm machine.
 */

import type { VehicleInfo } from "@/lib/types/chat";
import {
  CRITICAL_RAISED_STATE_PROMPT,
  needsCriticalRaisedState,
  type TurnFocus,
} from "@/lib/chat-intent-drift";
import { formatGarageVehicleAnchor } from "@/lib/vehicle-data/anchors";

export const CONTINUE_GUIDE_CHIP_ID = "continue-this-guide";
export const NEW_QUESTION_CHIP_ID = "ask-a-new-question";

/** Same [VEHICLE_ANCHOR] Chat injects for this garage vehicle. */
export function formatGuideVehicleAnchor(
  vehicle: VehicleInfo | null | undefined,
): string {
  if (!vehicle?.year || !vehicle.make || !vehicle.model) return "";
  return formatGarageVehicleAnchor(vehicle);
}

/**
 * Same raised / parking-brake flags Chat uses. Safety wins over guide copy:
 * CRITICAL STATE is included whenever Chat would inject it.
 */
export function formatGuideFocusSafety(focus: TurnFocus | null | undefined): string {
  if (!focus) return "";
  const lines = [
    `[FOCUS_SAFETY] vehicleRaised=${Boolean(focus.vehicleRaised)} parkingBrakeState=${focus.parkingBrakeState ?? "unknown"}`,
  ];
  if (needsCriticalRaisedState(focus)) {
    lines.push(CRITICAL_RAISED_STATE_PROMPT);
  }
  return lines.join("\n");
}

export function formatGuideChatSharedInject(input: {
  vehicle?: VehicleInfo | null;
  focus?: TurnFocus | null;
}): string {
  return [formatGuideVehicleAnchor(input.vehicle), formatGuideFocusSafety(input.focus)]
    .filter(Boolean)
    .join("\n\n");
}

export function continueGuideChatPrompt(input: {
  guideTitle: string;
  vehicle?: VehicleInfo | null;
  focus?: TurnFocus | null;
}): string {
  const inject = formatGuideChatSharedInject(input);
  const raisedNote = input.focus?.vehicleRaised
    ? " Safety first: treat the vehicle as already raised; if it is unstable, get clear from under it before any checks."
    : "";
  const pb =
    input.focus?.parkingBrakeState === "not_holding" ||
    input.focus?.parkingBrakeState === "failed"
      ? " Parking brake may not be holding — stability before DIY."
      : "";
  return [
    `Continue this coach guide (${input.guideTitle}) for my current vehicle. Keep the same job and do not start a different topic.${raisedNote}${pb}`,
    inject,
  ]
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

/** Hits existing drift reset (`new question` / `another issue`). */
export function newQuestionChatPrompt(): string {
  return "New question — this is a different issue from the coach guide. I have another issue on this vehicle.";
}

/** Text blob for HighRiskSafetyCallout — focus raised/PB wins over guide title. */
export function guideSafetyMatchText(input: {
  guideTitle?: string;
  guideDescription?: string;
  focus?: TurnFocus | null;
}): string {
  const bits: string[] = [];
  if (input.focus?.vehicleRaised) {
    bits.push("vehicle is on jack stands under the car");
  }
  if (
    input.focus?.parkingBrakeState === "not_holding" ||
    input.focus?.parkingBrakeState === "failed"
  ) {
    bits.push("parking brake is not holding rolling on a slope");
  }
  if (input.guideTitle) bits.push(input.guideTitle);
  if (input.guideDescription) bits.push(input.guideDescription);
  return bits.join("\n");
}
