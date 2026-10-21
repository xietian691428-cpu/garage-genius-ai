/**
 * Format [LIGHTING_PATH] Chat inject + continuation chips.
 */

import type { VehicleInfo } from "@/lib/types/chat";
import {
  resolveLightingPath,
  type ResolveLightingOptions,
} from "@/lib/lighting/resolve-path";
import type { LightingChip, LightingPathResult } from "@/lib/lighting/types";

const PATH_LABEL: Record<LightingPathResult["path"], string> = {
  likely_replaceable_bulb:
    "likely_replaceable_bulb — often a screw-in / plug-in source (still verify)",
  likely_sealed_or_integrated_led:
    "likely_sealed_or_integrated_led — often whole-lamp replacement (still verify)",
  ambiguous_needs_confirm:
    "ambiguous_needs_confirm — same YMM can differ by trim/options; confirm before buying",
};

export function formatLightingPathBlock(
  userMessage: string,
  vehicle?: VehicleInfo | null,
  options?: ResolveLightingOptions,
): string | null {
  const resolved = resolveLightingPath(vehicle ?? null, userMessage, options);
  if (!resolved) return null;

  const ymm = vehicle
    ? `${vehicle.year} ${vehicle.make} ${vehicle.model}${
        vehicle.submodel ? ` ${vehicle.submodel}` : ""
      }`
    : "vehicle not selected";

  const structureConfirmed =
    resolved.path !== "ambiguous_needs_confirm";

  const lines: string[] = [
    "[LIGHTING_PATH]",
    `Vehicle context: ${ymm}`,
    `Intent: ${resolved.intent}`,
    `Structure path: ${PATH_LABEL[resolved.path]}`,
    `Structure confirmed this turn: ${structureConfirmed ? "yes" : "no — path capped; no buy-size yet"}`,
    `Confidence language only: ${resolved.confidence} — never say 100% / "definitely" / "must replace the assembly now".`,
    `Data: ${
      resolved.dataMissing
        ? "no YMM lighting row — use generic education + confirmation questions; do NOT invent H11/9005/D3S or OEM lamp part numbers"
        : `weak table row ${resolved.entryId || "n/a"} — still verify on vehicle / owner's manual`
    }`,
    `Suggested Coach guide (optional): ${resolved.playbookSlug}`,
  ];

  if (resolved.bulbHint) {
    lines.push(
      `Allowlisted low-beam hint (verify on vehicle / manual — not VIN-proven): ${resolved.bulbHint}`,
    );
  } else {
    lines.push(
      "Bulb size: none allowlisted this turn — do not invent a bulb designation.",
    );
  }
  if (resolved.highBeamHint) {
    lines.push(
      `Allowlisted high-beam hint (verify): ${resolved.highBeamHint}`,
    );
  }

  lines.push("Cautions:");
  for (const c of resolved.cautions) lines.push(`- ${c}`);

  if (!structureConfirmed && resolved.confirmPrompts.length) {
    lines.push(
      "Ask the owner to confirm housing first (required when structure unconfirmed):",
    );
    for (const q of resolved.confirmPrompts) lines.push(`- ${q}`);
  }

  if (resolved.intent === "led_upgrade") {
    lines.push(
      "LED/HID upgrade mode: teach glare + FMVSS 108 / local-law risk; never say the upgrade is definitely legal or will not be ticketed; prefer assemblies designed for that source.",
    );
  }

  if (resolved.intent === "troubleshoot") {
    lines.push(
      "Troubleshoot mode: list possible causes (power/ground/bulb or source/connector/moisture/aim/(HID) ballast-related) — educational, no root-cause assertion. Adaptive/matrix lamps may need specialized diagnosis and aim.",
    );
  }

  lines.push(
    "Purchase path: explain bulb vs assembly risk and verify steps — do not only dump an Amazon link. Amazon links must remain keyword search if used.",
  );
  lines.push(
    "Tone: educational lighting coach — not a repair shop verdict, not a parts store, not legal advice.",
  );

  return lines.join("\n");
}

/**
 * Compact note for Shop Report — confirmed path language only, no root cause.
 */
export function formatLightingShopReportNote(
  userText: string,
  vehicle?: VehicleInfo | null,
  options?: ResolveLightingOptions & {
    intakeNote?: string | null;
  },
): string | null {
  const resolved = resolveLightingPath(vehicle ?? null, userText, options);
  if (!resolved) return null;
  const bits = [
    `Owner discussed exterior lighting (${resolved.intent}).`,
    `Educational structure path: ${resolved.path} (confidence ${resolved.confidence} — not VIN-proof).`,
  ];
  if (options?.intakeNote) bits.push(`Intake: ${options.intakeNote}`);
  if (resolved.bulbHint) {
    bits.push(`Allowlisted bulb hint was shown with verify disclaimer.`);
  } else if (resolved.dataMissing || resolved.path === "ambiguous_needs_confirm") {
    bits.push(`No confirmed bulb size — housing still verify-on-vehicle.`);
  }
  bits.push(
    "For the technician: confirm housing type, aim, moisture, and power/ground on the car. Adaptive/matrix systems may need specialized tools.",
  );
  return bits.join(" ");
}

/**
 * Chip priority: unconfirmed → confirm; replaceable → bulb steps; sealed → assembly.
 */
export function lightingFollowUpChips(
  userText: string,
  vehicle?: VehicleInfo | null,
  options?: ResolveLightingOptions,
): LightingChip[] {
  const resolved = resolveLightingPath(vehicle ?? null, userText, options);
  if (!resolved) return [];

  const confirmChip: LightingChip = {
    id: "lighting-confirm-housing",
    label: "Dust cap vs sealed?",
    prompt:
      "Help me confirm whether my headlights are a replaceable bulb (dust cap I can unscrew) or a sealed/integrated LED module (heatsink, no bulb access). Ask trim if needed. Use confidence language only — no 100% claims. Do not invent bulb sizes.",
  };
  const dustCapChip: LightingChip = {
    id: "lighting-say-dust-cap",
    label: "I see a dust cap",
    prompt:
      "Behind the headlight I can see a dust cap I can unscrew with a plug-in bulb. Treat this as replaceable-bulb path for THIS vehicle (still verify). Outline buy path and low-beam steps; do not invent sizes unless an allowlisted hint exists.",
  };
  const sealedChip: LightingChip = {
    id: "lighting-say-sealed",
    label: "Sealed LED module",
    prompt:
      "It looks like a sealed / heatsink LED module with no replaceable bulb. Treat this as sealed/integrated path — do NOT recommend halogen bulb sizes like H11. Outline assembly path and shop vs DIY complexity.",
  };
  const bulbSteps: LightingChip = {
    id: "lighting-bulb-steps",
    label: "Low beam bulb steps",
    playbookSlug: "lighting_replace_bulb",
    prompt:
      "Assuming a replaceable low-beam bulb on THIS vehicle, give educational DIY steps: power off, avoid touching halogen glass, access, seal, and function check. Do not say Replace the assembly now. Open the lighting_replace_bulb Coach guide if helpful.",
  };
  const assemblyPath: LightingChip = {
    id: "lighting-assembly-path",
    label: "Assembly path",
    playbookSlug: "lighting_replace_assembly_basic",
    prompt:
      "Walk through an educational headlamp assembly replacement path for THIS vehicle: tools, whether bumper work is common, complexity, and when to use a qualified tech. Include basic wall-aim concepts only — not professional beam calibration. No root-cause certainty.",
  };
  const ledRisks: LightingChip = {
    id: "lighting-led-risks",
    label: "LED upgrade risks",
    prompt:
      "Explain educational risks of putting aftermarket LED/HID bulbs in halogen headlamp housings: beam pattern, glare for oncoming drivers, FMVSS 108 / local rules may apply. Do not say it is definitely legal. Suggest assemblies designed for that light source. Insurance: may affect coverage — check the policy.",
  };
  const fogChip: LightingChip = {
    id: "lighting-foggy-lens",
    label: "Foggy / cloudy lens",
    playbookSlug: "lighting_lens_restore_edu",
    prompt:
      "Help with cloudy/yellowed lenses or moisture inside a headlamp: educational restore vs replace, moisture seal checks, and when fogging means a failed seal. Warn that aggressive polishing can thin the lens. No guaranteed DIY cure.",
  };

  const chips: LightingChip[] = [];

  if (resolved.path === "ambiguous_needs_confirm") {
    chips.push(confirmChip, dustCapChip, sealedChip);
  } else if (resolved.path === "likely_replaceable_bulb") {
    chips.push(bulbSteps, ledRisks, confirmChip);
  } else {
    chips.push(assemblyPath, confirmChip);
    if (resolved.intent === "led_upgrade") chips.push(ledRisks);
  }

  if (resolved.intent === "lens_fog" || resolved.intent === "troubleshoot") {
    chips.push(fogChip);
  }

  return chips.slice(0, 4);
}
