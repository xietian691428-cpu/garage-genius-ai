import type { VehicleInfo } from "@/lib/types/chat";

export type ConfigConflict = {
  code:
    | "drive_awd"
    | "drive_fwd"
    | "drive_rwd"
    | "trans_manual"
    | "trans_auto"
    | "fuel_diesel"
    | "fuel_gas"
    | "hybrid"
    | "turbo";
  severity: "high" | "medium";
  /** Short correction the model must state to the user */
  correction: string;
  message: string;
};

function norm(s: string | undefined | null): string {
  return (s || "").toLowerCase();
}

/**
 * Detect when the user's message implies a different config than the
 * authoritative vehicle profile (e.g. "my AWD Camry" vs FWD-only record).
 */
export function detectConfigConflicts(
  vehicle: VehicleInfo,
  userText: string,
): ConfigConflict[] {
  const text = norm(userText);
  if (!text.trim()) return [];

  const drive = norm(vehicle.driveType);
  const engine = norm(vehicle.engine);
  const trans = norm(vehicle.transmission);
  const sub = norm(vehicle.submodel);
  const identity = `${vehicle.year} ${vehicle.make} ${vehicle.model}${
    vehicle.submodel ? ` ${vehicle.submodel}` : ""
  }`;
  const conflicts: ConfigConflict[] = [];

  const mentionsAwd =
    /\b(awd|4wd|4x4|all[\s-]?wheel|four[\s-]?wheel)\b/.test(text);
  const mentionsFwd = /\b(fwd|front[\s-]?wheel)\b/.test(text);
  const mentionsRwd = /\b(rwd|rear[\s-]?wheel)\b/.test(text);
  const mentionsManual =
    /\b(manual(\s+transmission)?|stick\s*shift|5[\s-]?speed manual|6[\s-]?speed manual)\b/.test(
      text,
    );
  const mentionsAuto =
    /\b(automatic(\s+transmission)?|cvt|auto\s+trans)\b/.test(text);
  const mentionsDiesel = /\b(diesel|tdi|duramax|powerstroke|cummins)\b/.test(
    text,
  );
  const mentionsGas =
    /\b(gasoline|petrol|gas\s+engine|flex[\s-]?fuel)\b/.test(text);
  const mentionsHybrid = /\b(hybrid|prius[\s-]?mode|hev|phev)\b/.test(text);
  const mentionsTurbo =
    /\b(turbo|turbocharged|ecoboost|t[ds]i)\b/.test(text) &&
    !/\bnon[\s-]?turbo|naturally aspirated\b/.test(text);

  if (mentionsAwd && drive && !/(awd|4wd|4x4|all)/.test(drive)) {
    conflicts.push({
      code: "drive_awd",
      severity: "high",
      correction: `Your garage profile lists this ${identity} as **${vehicle.driveType || "non-AWD"}**, not AWD/4WD.`,
      message: `User said AWD/4WD, but authoritative config is ${vehicle.driveType}.`,
    });
  }
  if (
    mentionsFwd &&
    drive &&
    /(awd|4wd|rwd|rear)/.test(drive) &&
    !/fwd|front/.test(drive)
  ) {
    conflicts.push({
      code: "drive_fwd",
      severity: "medium",
      correction: `Your profile lists drive as **${vehicle.driveType}**, not FWD.`,
      message: `User said FWD, but profile is ${vehicle.driveType}.`,
    });
  }
  if (mentionsRwd && drive && !/(rwd|rear)/.test(drive)) {
    conflicts.push({
      code: "drive_rwd",
      severity: "medium",
      correction: `Your profile lists drive as **${vehicle.driveType}**, not RWD.`,
      message: `User said RWD, but profile is ${vehicle.driveType}.`,
    });
  }

  if (
    mentionsManual &&
    trans &&
    /(auto|cvt|transaxle automatic)/.test(trans) &&
    !/manual/.test(trans)
  ) {
    conflicts.push({
      code: "trans_manual",
      severity: "high",
      correction: `Your profile lists transmission as **${vehicle.transmission}**, not a manual.`,
      message: `User said manual, but profile is ${vehicle.transmission}.`,
    });
  }
  if (
    mentionsAuto &&
    trans &&
    /manual/.test(trans) &&
    !/(auto|cvt)/.test(trans)
  ) {
    conflicts.push({
      code: "trans_auto",
      severity: "medium",
      correction: `Your profile lists transmission as **${vehicle.transmission}**.`,
      message: `User said automatic, but profile is ${vehicle.transmission}.`,
    });
  }

  if (mentionsDiesel && engine && !/diesel/.test(engine)) {
    conflicts.push({
      code: "fuel_diesel",
      severity: "high",
      correction: `Your profile engine is **${vehicle.engine}** (not diesel).`,
      message: `User said diesel, but engine is ${vehicle.engine}.`,
    });
  }
  if (mentionsGas && engine && /diesel/.test(engine)) {
    conflicts.push({
      code: "fuel_gas",
      severity: "high",
      correction: `Your profile engine is **${vehicle.engine}** (diesel).`,
      message: `User said gasoline, but engine is ${vehicle.engine}.`,
    });
  }

  const profileHybrid =
    /hybrid/.test(engine) ||
    /hybrid/.test(sub) ||
    /hybrid/.test(norm(vehicle.model));
  if (mentionsHybrid && !profileHybrid) {
    conflicts.push({
      code: "hybrid",
      severity: "high",
      correction: `Your garage profile for **${identity}** does not look hybrid (${vehicle.engine || "engine unknown"}).`,
      message: `User said hybrid, but profile does not appear hybrid.`,
    });
  }

  if (
    mentionsTurbo &&
    engine &&
    !/(turbo|supercharged)/.test(engine) &&
    /\bna\b|naturally/.test(engine)
  ) {
    conflicts.push({
      code: "turbo",
      severity: "medium",
      correction: `Your profile engine is **${vehicle.engine}** (not turbo).`,
      message: `User implied turbo, but engine label is ${vehicle.engine}.`,
    });
  }

  return conflicts;
}

/** Prompt block: force explicit correction before DIY / parts advice */
export function formatConflictsForPrompt(conflicts: ConfigConflict[]): string {
  if (!conflicts.length) return "";
  const lines = [
    "## Configuration Conflict — CORRECT THE USER FIRST",
    "The latest user message conflicts with the authoritative VCdb vehicle profile.",
    "Required behavior:",
    "1. Open with a clear, polite correction (use the Correction lines below).",
    "2. Do NOT recommend AWD-only / wrong-fuel / wrong-trans parts until they confirm or update the garage profile.",
    "3. Ask one clarifying question: keep the profile, or switch trim/powertrain?",
    "",
    "Conflicts:",
    ...conflicts.map(
      (c) =>
        `- (${c.severity}) ${c.message}\n  Correction to state: ${c.correction}`,
    ),
  ];
  return lines.join("\n");
}

/**
 * Focus Mode hints derived from the saved VCdb config —
 * steer dashboard highlight toward config-consistent systems.
 */
export function formatFocusConfigHints(vehicle: VehicleInfo): string {
  const drive = vehicle.driveType || "unknown";
  const brakes = vehicle.brakes || "unknown";
  const engine = vehicle.engine || "unknown";
  const trans = vehicle.transmission || "unknown";

  return `## Focus Mode — use vehicle configuration first
When emitting <focus> / <focus-data>, prefer systems that exist on THIS profile:
- Engine context: ${engine}
- Transmission: ${trans}
- Drive: ${drive} — do not diagnose transfer-case / rear-diff AWD issues unless Drive is AWD/4WD.
- Brakes: ${brakes} — if ABS is listed, include ABS bleed / sensor checks when brake symptoms appear.
Align Focus part (engine | brakes | suspension | battery | tires | hvac | ac | transmission | lights) with the config card and RAG CONFIG tier before guessing.`;
}
