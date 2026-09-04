/**
 * US completion-funnel helpers — discovery only.
 * Reuses existing DTC ↔ playbook maps. Does not add Auto.dev or new models.
 */

import {
  buildDtcDiagnosisPrompt,
  lookupDtc,
  matchPlaybookForDtc,
} from "@/lib/dtc";

/** Already mapped in lib/dtc.ts — expose these, do not grow the table. */
export const US_HIGH_FREQ_DTC_CODES = [
  "P0420",
  "P0300",
  "P0171",
  "P0455",
  "U0100",
] as const;

export type UsHighFreqDtcChip = {
  id: string;
  code: string;
  label: string;
  hint: string;
  prompt: string;
  playbookSlug: string;
};

function shortHint(desc: string): string {
  const first = desc.split(/[.(–—]/)[0]?.trim() || desc;
  return first.length > 28 ? `${first.slice(0, 26)}…` : first;
}

export function getUsHighFreqDtcChips(): UsHighFreqDtcChip[] {
  return US_HIGH_FREQ_DTC_CODES.map((code) => {
    const parsed = lookupDtc(code);
    const match = matchPlaybookForDtc(parsed);
    return {
      id: `us-dtc-${code}`,
      code,
      label: `${code} ${shortHint(parsed.desc)}`,
      hint: parsed.desc,
      prompt: buildDtcDiagnosisPrompt({
        codes: [parsed],
        source: "manual",
      }),
      playbookSlug: match.slug,
    };
  });
}

export const EMPTY_GARAGE_DIY_HEADLINE =
  "Add this car first — then we can talk codes, oil, and recalls without guessing the wrong vehicle.";

export const EMPTY_GARAGE_DIY_STEPS = [
  "Save year / make / model (VIN decode if you have it).",
  "If the check-engine light is on, enter the code — P0420, P0300, P0171, P0455, or U0100 are common US starts.",
  "US market: Safety campaigns show as a dismissible hint, not a blocker.",
] as const;

export const POST_SAVE_NUDGE_COPY =
  "Vehicle saved. If the check-engine light is on, start with a code. US cars also get a dismissible Safety campaigns hint in the garage.";
