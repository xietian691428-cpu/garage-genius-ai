/**
 * Soft-rewrite AI output that asserts insurance coverage outcomes.
 */

import {
  INSURANCE_FORBIDDEN_PATTERNS,
  INSURANCE_SAFETY_COPY,
  MOD_CONTEXT_PATTERN,
} from "@/lib/insurance-safety-copy";

export function textAssertsInsuranceCoverage(text: string): boolean {
  return INSURANCE_FORBIDDEN_PATTERNS.some((p) => p.pattern.test(text));
}

/**
 * Replace forbidden coverage assertions with neutral education lines.
 * Idempotent enough for repeated passes on short answers.
 */
export function rewriteInsuranceCoverageClaims(text: string): string {
  if (!text?.trim()) return text;
  let out = text;
  for (const { pattern, replacement } of INSURANCE_FORBIDDEN_PATTERNS) {
    // Reset lastIndex for global regexes
    pattern.lastIndex = 0;
    if (pattern.test(out)) {
      pattern.lastIndex = 0;
      out = out.replace(pattern, replacement);
    }
  }
  return out;
}

/** Ensure mod / aftermarket answers include a may-affect reminder. */
export function ensureModInsuranceReminder(
  text: string,
  userOrAssistantContext?: string,
): string {
  const blob = `${userOrAssistantContext || ""}\n${text}`;
  if (!MOD_CONTEXT_PATTERN.test(blob)) return text;
  if (
    /may affect.*(coverage|insurance|policy)|check your policy|contact your insurer/i.test(
      text,
    )
  ) {
    return text;
  }
  return `${text.trim()}\n\n${INSURANCE_SAFETY_COPY.modMayAffect}`;
}

/** Pipeline for chat / shop-report free text. */
export function applyInsuranceSafetyGuards(
  text: string,
  opts?: { userContext?: string },
): string {
  let out = rewriteInsuranceCoverageClaims(text);
  out = ensureModInsuranceReminder(out, opts?.userContext);
  return out;
}
