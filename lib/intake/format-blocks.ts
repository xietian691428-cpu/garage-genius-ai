/**
 * Prompt blocks: [INTAKE_STATE] + intake-aware reply constraints.
 */

import type { IntakeDeriveResult, IntakeSlots } from "@/lib/intake/types";

function slotLine(label: string, value: string | null | undefined): string | null {
  if (!value || value === "unknown" || value === "unset" || value === "na") {
    return null;
  }
  return `${label}=${value}`;
}

export function formatIntakeStateBlock(result: IntakeDeriveResult): string {
  const s = result.slots;
  const filled = [
    slotLine("symptom", s.symptom_summary),
    slotLine("when_started", s.when_started),
    slotLine("onset", s.sudden_or_gradual !== "unknown" ? s.sudden_or_gradual : null),
    slotLine(
      "pattern",
      s.intermittent_or_constant !== "unknown"
        ? s.intermittent_or_constant
        : null,
    ),
    slotLine("after_event", s.after_event),
    slotLine("side", s.side !== "unknown" ? s.side : null),
    s.conditions.length ? `conditions=${s.conditions.join(",")}` : null,
    slotLine("already_tried", s.already_tried),
    s.dtc_list.length ? `dtc=${s.dtc_list.join(",")}` : null,
    `evidence=${s.evidence_level}`,
    slotLine("lighting_structure", s.lighting_structure),
    slotLine(
      "lighting_function",
      s.lighting_function !== "unknown" ? s.lighting_function : null,
    ),
    slotLine(
      "housing_confirm",
      s.housing_confirm !== "unset" ? s.housing_confirm : null,
    ),
    slotLine("trim", s.trim_or_package),
  ].filter(Boolean);

  const missing =
    result.missingCritical.length > 0
      ? `Missing critical slots (ask ≤2–3 before long diagnosis): ${result.missingCritical.join(", ")}.`
      : "No critical intake gaps for this turn.";

  const askFirst = result.preferIntakeQuestions
    ? "PRIORITY: Ask the missing high-value questions first (chips OK). Do not dump a long parts/cause list until slots above are filled or owner declines."
    : "Intake sufficient to proceed with educational narrowing — still no root-cause assertions.";

  const lightingGate =
    result.lightingIntent && s.lighting_structure === "unknown"
      ? "LIGHTING GATE: structure unknown — do NOT output bulb sizes (H11/9005/etc.), buy links as definitive fitment, or OEM part numbers. Confirm dust-cap vs sealed/integrated module first."
      : result.lightingIntent && s.lighting_structure === "sealed_or_integrated_led"
        ? "LIGHTING GATE: sealed/integrated confirmed — do NOT push halogen bulb sizes; assembly / shop-vs-DIY path only."
        : result.lightingIntent
          ? "LIGHTING GATE: replaceable path allowed only with verify disclaimer; still not VIN-proven fitment."
          : null;

  return [
    "[INTAKE_STATE]",
    "Ephemeral session slots (no VIN). Use to ask like a tech — then narrow. Never invent missing facts.",
    filled.length ? `Known: ${filled.join("; ")}` : "Known: (minimal — mostly open slots)",
    missing,
    askFirst,
    lightingGate,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Compact summary for shop-report style notes (education). */
export function summarizeIntakeForShopNote(slots: IntakeSlots): string {
  const bits = [
    slots.lighting_structure !== "unknown"
      ? `lighting_structure=${slots.lighting_structure}`
      : null,
    slots.housing_confirm !== "unset"
      ? `housing=${slots.housing_confirm}`
      : null,
    slots.dtc_list.length ? `dtc=${slots.dtc_list.join(",")}` : null,
    slots.already_tried ? "owner_tried=yes" : null,
  ].filter(Boolean);
  return bits.join("; ") || "intake=minimal";
}
