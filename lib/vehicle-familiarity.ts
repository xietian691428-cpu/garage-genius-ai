/**
 * Vehicle familiarity from maintenance history density.
 * Used in chat prompts so the model leans harder on logged work.
 */

import type { MaintenanceRecord } from "@/lib/types/maintenance";

export type FamiliarityLevel = "new" | "learning" | "familiar" | "expert";

export type VehicleFamiliarity = {
  level: FamiliarityLevel;
  /** 0–100 score for UI / prompt */
  score: number;
  recordCount: number;
  label: string;
};

/**
 * More logged jobs → higher familiarity.
 * Receipt-sourced records count the same as manual (both are verified by the owner).
 */
export function computeVehicleFamiliarity(
  records: MaintenanceRecord[],
  totalHint?: number,
): VehicleFamiliarity {
  const recordCount = Math.max(totalHint ?? 0, records.length);
  let score = 0;
  score += Math.min(55, recordCount * 12);
  const withMileage = records.filter((r) => r.mileage != null).length;
  const withParts = records.filter(
    (r) => Array.isArray(r.partsUsed) && r.partsUsed.length > 0,
  ).length;
  const withCost = records.filter((r) => r.costCents != null).length;
  score += Math.min(15, withMileage * 3);
  score += Math.min(15, withParts * 4);
  score += Math.min(15, withCost * 3);
  score = Math.max(0, Math.min(100, Math.round(score)));

  let level: FamiliarityLevel = "new";
  if (score >= 75 || recordCount >= 8) level = "expert";
  else if (score >= 45 || recordCount >= 4) level = "familiar";
  else if (score >= 15 || recordCount >= 1) level = "learning";

  const label =
    level === "expert"
      ? "High — rich service history on file"
      : level === "familiar"
        ? "Good — several jobs logged"
        : level === "learning"
          ? "Building — a few records saved"
          : "New — little or no service history yet";

  return { level, score, recordCount, label };
}

export function formatFamiliarityForPrompt(
  familiarity: VehicleFamiliarity,
): string {
  return `## Vehicle familiarity
Level: ${familiarity.level} (score ${familiarity.score}/100) — ${familiarity.label}.
Logged jobs: ${familiarity.recordCount}. Prefer citing these records over generic maintenance advice; do not re-recommend work already completed unless wear intervals clearly apply.`;
}
