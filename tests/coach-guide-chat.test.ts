import { describe, expect, it } from "vitest";
import {
  continueGuideChatPrompt,
  formatGuideChatSharedInject,
  formatGuideVehicleAnchor,
  newQuestionChatPrompt,
  guideSafetyMatchText,
} from "@/lib/coach-guide-chat";
import {
  buildTurnFocus,
  CRITICAL_RAISED_STATE_PROMPT,
  detectIntentDrift,
  matchDriftSafetyTopics,
  needsCriticalRaisedState,
} from "@/lib/chat-intent-drift";
import { formatGarageVehicleAnchor } from "@/lib/vehicle-data/anchors";
import type { VehicleInfo } from "@/lib/types/chat";

const camry: VehicleInfo = {
  id: "v-camry",
  name: "Camry",
  year: 2021,
  make: "Toyota",
  model: "Camry",
  market: "US",
  mileage: 48000,
  engine: "2.5L",
};

describe("Guide ↔ Chat shared inject (Player internals untouched)", () => {
  it("uses the same [VEHICLE_ANCHOR] as Chat for this garage vehicle", () => {
    const guide = formatGuideVehicleAnchor(camry);
    const chat = formatGarageVehicleAnchor(camry);
    expect(guide).toBe(chat);
    expect(guide).toContain("[VEHICLE_ANCHOR]");
    expect(guide).toMatch(/2021/);
    expect(guide).toMatch(/Toyota/);
    expect(guide).toMatch(/Camry/);
  });

  it("injects the same CRITICAL STATE when Chat would (raised + brakes/PB)", () => {
    const focus = buildTurnFocus(
      "Car is on jack stands. Parking brake is not holding on the slope.",
      0,
    );
    expect(focus.vehicleRaised).toBe(true);
    expect(needsCriticalRaisedState(focus)).toBe(true);
    const inject = formatGuideChatSharedInject({ vehicle: camry, focus });
    expect(inject).toContain("[VEHICLE_ANCHOR]");
    expect(inject).toContain("[FOCUS_SAFETY]");
    expect(inject).toMatch(/vehicleRaised=true/);
    expect(inject).toContain(CRITICAL_RAISED_STATE_PROMPT);
  });

  it("Continue keeps the guide; New question hits existing drift reset", () => {
    const continuePrompt = continueGuideChatPrompt({
      guideTitle: "Oil change",
      vehicle: camry,
    });
    expect(continuePrompt.toLowerCase()).toMatch(/continue this coach guide/);
    expect(continuePrompt.toLowerCase()).not.toMatch(/new question/);
    expect(continuePrompt.toLowerCase()).not.toMatch(/another issue/);

    const previous = buildTurnFocus("2021 Camry oil change on jack stands.", 0);
    const next = newQuestionChatPrompt();
    const drift = detectIntentDrift(
      next,
      [
        { role: "user", content: "2021 Camry oil change on jack stands." },
        { role: "user", content: next },
      ],
      previous,
      matchDriftSafetyTopics(next),
    );
    expect(drift.shouldReset).toBe(true);
    expect(drift.reason).toBe("explicit_new_issue");
  });

  it("safety match text prefers raised/PB over a casual oil-guide title", () => {
    const focus = buildTurnFocus(
      "Vehicle is raised on jack stands and the parking brake is not holding.",
      0,
    );
    const blob = guideSafetyMatchText({
      guideTitle: "Oil change",
      guideDescription: "Drain and refill.",
      focus,
    });
    expect(blob.toLowerCase()).toMatch(/jack stands/);
    expect(blob.toLowerCase()).toMatch(/parking brake/);
    expect(blob.indexOf("jack")).toBeLessThan(blob.indexOf("Oil change"));
  });
});
