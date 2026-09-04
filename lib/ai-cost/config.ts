/**
 * AI cost hard cap — USD budget + monthly vision calls.
 *
 * Default ON (including production). Unset = ON. Set AI_COST_HARD_CAP=0 to
 * disable for staging/incidents only. Do not ship production with =0.
 */

import { isProductionDeploy } from "@/lib/qa-mode";

function envFlag(raw: string | undefined): boolean | null {
  if (raw == null || raw.trim() === "") return null;
  const v = raw.trim().toLowerCase();
  if (["0", "false", "off", "no"].includes(v)) return false;
  if (["1", "true", "on", "yes"].includes(v)) return true;
  return null;
}

/**
 * Strict spend/vision enforcement.
 * Unset → ON. Production stays ON unless explicitly set to 0.
 */
export function isAiCostHardCapEnabled(): boolean {
  const parsed = envFlag(process.env.AI_COST_HARD_CAP);
  if (parsed === false) return false;
  if (parsed === true) return true;
  if (isProductionDeploy()) return true;
  return true;
}
