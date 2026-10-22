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
    slotLine("focus", result.focusIntent !== "none" ? result.focusIntent : null),
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
    slotLine(
      "battery_symptom",
      s.battery_symptom !== "unknown" ? s.battery_symptom : null,
    ),
    slotLine("lights_dim", s.lights_dim !== "unknown" ? s.lights_dim : null),
    slotLine(
      "recent_battery_work",
      s.recent_battery_work !== "unknown" ? s.recent_battery_work : null,
    ),
    slotLine("parked_days", s.parked_days),
    slotLine("weather_cold", s.weather_cold !== "unknown" ? s.weather_cold : null),
    slotLine(
      "temp_gauge_or_light",
      s.temp_gauge_or_light !== "unknown" ? s.temp_gauge_or_light : null,
    ),
    slotLine("steam", s.steam !== "unknown" ? s.steam : null),
    slotLine(
      "level_checked_cold",
      s.level_checked_cold !== "unknown" ? s.level_checked_cold : null,
    ),
    slotLine(
      "recent_cooling_work",
      s.recent_cooling_work !== "unknown" ? s.recent_cooling_work : null,
    ),
    slotLine("pedal_feel", s.pedal_feel !== "unknown" ? s.pedal_feel : null),
    slotLine(
      "brake_warning_light",
      s.brake_warning_light !== "unknown" ? s.brake_warning_light : null,
    ),
    slotLine(
      "brake_level_checked",
      s.brake_level_checked !== "unknown" ? s.brake_level_checked : null,
    ),
    slotLine(
      "brake_after_event",
      s.brake_after_event !== "unknown" ? s.brake_after_event : null,
    ),
    slotLine("pulls_or_noise", s.pulls_or_noise),
  ].filter(Boolean);

  const missing =
    result.missingCritical.length > 0
      ? `Missing critical slots (ask ≤2 high-value questions before long diagnosis): ${result.missingCritical.join(", ")}.`
      : "No critical intake gaps for this turn.";

  const askFirst = result.preferIntakeQuestions
    ? "PRIORITY: Ask the missing high-value questions first (chips OK). Do not dump a long parts/cause list until slots above are filled or owner declines. Never say Replace battery now / Replace converter now / Replace master cylinder now."
    : "Intake sufficient to proceed with educational narrowing — still no root-cause assertions.";

  const lightingGate =
    result.lightingIntent && s.lighting_structure === "unknown"
      ? "LIGHTING GATE: structure unknown — do NOT output bulb sizes (H11/9005/etc.), buy links as definitive fitment, or OEM part numbers. Confirm dust-cap vs sealed/integrated module first. Low-confidence housing photos must NOT invent structure or bulb size — ask retake or dust-cap question."
      : result.lightingIntent && s.lighting_structure === "sealed_or_integrated_led"
        ? "LIGHTING GATE: sealed/integrated confirmed (owner or high-confidence photo assist) — do NOT push halogen bulb sizes; assembly / shop-vs-DIY path only. Still invite a short verbal confirm if only photo-assisted."
        : result.lightingIntent
          ? "LIGHTING GATE: replaceable path allowed only with verify disclaimer; still not VIN-proven fitment. Never say the photo alone proves an H-number."
          : null;

  const batteryGate = result.batteryIntent
    ? [
        "BATTERY/CRANKING GATE: educate no_crank vs slow_crank vs clicks before parts.",
        "Do not assert Replace battery now. Jump-pack misuse / sulfation deep DIY / airbag-line work: stop — see a pro.",
        "OBD voltage is OBSERVED only if a live adapter snapshot is present this turn — never invent voltage.",
      ].join(" ")
    : null;

  const overheatGate = result.overheatIntent
    ? [
        "OVERHEAT GATE: NEVER instruct opening a hot radiator/coolant pressure cap.",
        "Educational check order when safe: cold coolant level → leak signs → fan operation → shop. No invented cap pressure or capacity.",
        s.steam === "yes"
          ? "Steam reported: do not keep driving; pull over safely when possible and arrange a tow — do not limp on the highway."
          : "If steam develops or gauge stays in red: do not drive / arrange a tow.",
      ].join(" ")
    : null;

  const brakeGate = result.brakeIntent
    ? [
        "BRAKE GATE: Soft/spongy/sinking pedal or brake warning light ON → do not drive if unsafe; arrange a tow / professional inspection (coordinate with DRIVE_SAFETY).",
        "FORBIDDEN DIY: bleeding brakes, opening caliper lines/hoses, teaching “drain the brake fluid first,” ABS module deep work.",
        "Education only: cold reservoir sight-glass level observation, recent pad/fluid work history, gather info for the shop.",
        "Causes are possible only — never “It’s definitely the master cylinder” or Replace master cylinder now.",
        result.brakeStopDrive
          ? "STOP-DRIVE active this turn: lead with safety / tow; do not coach highway driving or limp-to-shop."
          : "If pedal feel or warning light still unknown, ask ≤2 intake questions first.",
      ].join(" ")
    : null;

  return [
    "[INTAKE_STATE]",
    "Ephemeral session slots (no VIN). Use to ask like a tech — then narrow. Never invent missing facts.",
    filled.length ? `Known: ${filled.join("; ")}` : "Known: (minimal — mostly open slots)",
    missing,
    askFirst,
    lightingGate,
    batteryGate,
    overheatGate,
    brakeGate,
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
    slots.battery_symptom !== "unknown"
      ? `battery=${slots.battery_symptom}`
      : null,
    slots.steam === "yes" ? "steam=yes" : null,
    slots.pedal_feel !== "unknown" ? `pedal=${slots.pedal_feel}` : null,
    slots.brake_warning_light !== "unknown"
      ? `brake_light=${slots.brake_warning_light}`
      : null,
    slots.dtc_list.length ? `dtc=${slots.dtc_list.join(",")}` : null,
    slots.already_tried ? "owner_tried=yes" : null,
  ].filter(Boolean);
  return bits.join("; ") || "intake=minimal";
}
