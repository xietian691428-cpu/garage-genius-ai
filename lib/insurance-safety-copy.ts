/**
 * Insurance & safety product copy (en-US) — educational only, never coverage claims.
 */

export const INSURANCE_SAFETY_COPY = {
  educationalOnly:
    "Educational only — not professional or insurance advice.",
  mayAffectCoverage:
    "This may affect your insurance coverage. Check your policy or insurer.",
  verifyBeforeDriving:
    "When in doubt, have a qualified technician verify before driving.",

  modMayAffect:
    "Modifications and non-OEM parts may affect your insurance coverage or future claims. Check your policy and insurer before changing safety-related components.",
  weDontDetermineCoverage:
    "We don’t determine what your policy covers. That’s between you and your insurer.",

  safetyCriticalMayAffect:
    "Work on brakes, steering, airbags, or structural components can affect safety and may have insurance implications.",
  safetyCriticalGuideOnly:
    "This guide is for understanding and inspection only. For safety-critical systems, professional installation or verification is strongly recommended.",
  exportShopReport:
    "You can export a Shop Report to share what you’ve observed with a qualified technician.",

  possibleFactorsOnly:
    "Possible factors are for professional verification only — not a final diagnosis.",
  nextStepOptions:
    "Next step: continue basic checks, export a Shop Report, or have a shop verify.",

  shopReportInsuranceAddendum:
    "This report does not advise on insurance coverage and is not proof of proper repair. Repair and coverage decisions remain between you, your technician, and your insurer.",

  settingsTitle: "Insurance & safety",
  settingsBody: `Garage Genius AI provides educational coaching only. It does not determine insurance coverage, approve repairs, or replace a qualified technician.

Modifications, non-OEM parts, and work on safety-critical systems (such as brakes, steering, and airbags) may affect your policy or claims. Always check your policy and insurer.

If something is safety-critical or you’re unsure, export a Shop Report and have a professional verify before driving.`,

  highAckCheckbox:
    "I understand this is educational only, not professional or insurance advice.",
  highAckContinue: "Continue",
  highAckCancel: "Cancel",

  rewriteMayAffect:
    "This may affect coverage — check your policy or insurer.",
  rewriteDependsOnPolicy:
    "Coverage depends on your policy; we can’t determine claim outcomes.",
} as const;

/** Soft rewrite templates when model asserts coverage outcomes. */
export const INSURANCE_FORBIDDEN_PATTERNS: Array<{
  pattern: RegExp;
  replacement: string;
}> = [
  {
    pattern:
      /\b(will|won't|will not|won't)\s+(be\s+)?(covered|denied|paid|accepted)\b/gi,
    replacement: INSURANCE_SAFETY_COPY.rewriteMayAffect,
  },
  {
    pattern:
      /\b(void|voids|voiding)\s+(your\s+)?(insurance|policy|coverage)\b/gi,
    replacement: INSURANCE_SAFETY_COPY.rewriteMayAffect,
  },
  {
    pattern:
      /\binsurance\s+(will|won't|will not)\s+(pay|cover|deny|accept)\b/gi,
    replacement: INSURANCE_SAFETY_COPY.rewriteDependsOnPolicy,
  },
  {
    pattern:
      /\b(insurance[- ]approved|insurer\s+accepts\s+this|guaranteed\s+coverage)\b/gi,
    replacement: INSURANCE_SAFETY_COPY.rewriteDependsOnPolicy,
  },
  {
    pattern:
      /\bsafe\s+to\s+skip\s+the\s+shop\s+for\s+insurance\b/gi,
    replacement: INSURANCE_SAFETY_COPY.verifyBeforeDriving,
  },
];

export const MOD_CONTEXT_PATTERN =
  /\b(mod(?:ification|ded)?|aftermarket|non[- ]?oem|tune[sd]?|tuned|chip\s*tune|stage\s*[123]|catless|downpipe|coilover|stance|track\s*day)\b/i;
