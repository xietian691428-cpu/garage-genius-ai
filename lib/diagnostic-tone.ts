/**
 * Root-cause / certainty phrasing for diagnosis replies.
 * Separate from safety-topics (lifting, brakes callouts) and insurance rewrite.
 */

export type DiagnosticToneHit = {
  id: string;
  phrase: string;
};

const UNNEGATED_WINDOW = 28;

function unnegatedIncludes(hay: string, phrase: string): boolean {
  const needle = phrase.toLowerCase();
  const text = hay.toLowerCase();
  let from = 0;
  while (from < text.length) {
    const idx = text.indexOf(needle, from);
    if (idx < 0) return false;
    const window = text.slice(Math.max(0, idx - UNNEGATED_WINDOW), idx);
    if (
      !/(?:do not|don't|dont|never|not|avoid|without)\s+[^.?!]{0,24}$/.test(
        window,
      )
    ) {
      return true;
    }
    from = idx + needle.length;
  }
  return false;
}

/** Stable ids for Vitest — keep insurance phrases out of this list. */
export const DIAGNOSTIC_TONE_PHRASES: ReadonlyArray<{
  id: string;
  needle: string;
}> = [
  { id: "replace_x_now", needle: "replace it now" },
  { id: "replace_x_now_generic", needle: "replace x now" },
  { id: "replace_now", needle: "replace now" },
  { id: "its_definitely", needle: "it's definitely" },
  { id: "its_definitely_curly", needle: "it’s definitely" },
  { id: "it_is_definitely", needle: "it is definitely" },
  { id: "definitely_the", needle: "definitely the" },
  { id: "must_be_the", needle: "must be the" },
  { id: "must_replace", needle: "must replace" },
  { id: "replace_the_cat_now", needle: "replace the catalytic" },
  { id: "replace_the_converter", needle: "replace the converter" },
  { id: "guaranteed_fix", needle: "guaranteed fix" },
];

export function diagnosticToneFailures(text: string): string[] {
  const hay = text || "";
  const errors: string[] = [];
  for (const row of DIAGNOSTIC_TONE_PHRASES) {
    if (unnegatedIncludes(hay, row.needle)) {
      errors.push(`diagnostic_tone:${row.id}`);
    }
  }
  if (/\breplace the [a-z][\w-]* now\b/i.test(hay)) {
    const re = /\breplace the [a-z][\w-]* now\b/gi;
    let match: RegExpExecArray | null;
    while ((match = re.exec(hay))) {
      const window = hay.slice(Math.max(0, match.index - UNNEGATED_WINDOW), match.index);
      if (
        !/(?:do not|don't|dont|never|not|avoid|without)\s+[^.?!]{0,24}$/i.test(
          window,
        )
      ) {
        errors.push("diagnostic_tone:replace_the_x_now");
        break;
      }
    }
  }
  return errors;
}

export function answerHasDiagnosticToneViolation(text: string): boolean {
  return diagnosticToneFailures(text).length > 0;
}

type RewriteRule = { pattern: RegExp; replacement: string };

const REWRITE_RULES: RewriteRule[] = [
  {
    pattern: /\breplace the ([a-z][\w-]*) now\b/gi,
    replacement: "inspect the $1 before replacing",
  },
  {
    pattern: /\breplace\s+it\s+now\b/gi,
    replacement: "inspect it before deciding on parts",
  },
  {
    pattern: /\breplace\s+x\s+now\b/gi,
    replacement: "inspect the related part before buying",
  },
  {
    pattern: /\breplace\s+now\b/gi,
    replacement: "inspect before replacing",
  },
  {
    pattern: /\bit['’]s definitely\b/gi,
    replacement: "it may be",
  },
  {
    pattern: /\bit is definitely\b/gi,
    replacement: "it may be",
  },
  {
    pattern: /\bdefinitely the\b/gi,
    replacement: "a possible cause is the",
  },
  {
    pattern: /\bmust be the\b/gi,
    replacement: "may be the",
  },
  {
    pattern: /\bmust replace\b/gi,
    replacement: "consider inspecting",
  },
  {
    pattern: /\breplace the catalytic converter now\b/gi,
    replacement:
      "inspect exhaust leaks and O2 data before considering a catalytic converter",
  },
  {
    pattern: /\breplace the catalytic\b/gi,
    replacement:
      "inspect related exhaust/O2 checks before considering a catalytic converter",
  },
  {
    pattern: /\breplace the converter now\b/gi,
    replacement:
      "inspect exhaust leaks and O2 data before considering a converter",
  },
  {
    pattern: /\breplace the converter\b/gi,
    replacement:
      "inspect exhaust leaks and O2 data before considering a converter",
  },
  {
    pattern: /\bguaranteed fix\b/gi,
    replacement: "educational check, not a guaranteed fix",
  },
];

/**
 * Soft-rewrite root-cause orders. Skips a match when a nearby negation
 * already made the sentence educational (“do not replace the converter”).
 */
export function rewriteDiagnosticTone(text: string): string {
  if (!text?.trim()) return text;
  let out = text;
  for (const { pattern, replacement } of REWRITE_RULES) {
    pattern.lastIndex = 0;
    out = out.replace(pattern, (match, offset: number) => {
      const window = out.slice(Math.max(0, offset - UNNEGATED_WINDOW), offset);
      if (
        /(?:do not|don't|dont|never|not|avoid)\s+[^.?!]{0,24}$/i.test(window)
      ) {
        return match;
      }
      return replacement;
    });
  }
  return out;
}

export function applyDiagnosticToneGuards(text: string): string {
  return rewriteDiagnosticTone(text);
}
