/**
 * OBD-II style DTC tokenization — shared by chat text, IMAGE_ANALYSIS, and Enter code.
 * Does not look up meanings (see lib/vehicle-data/dtc-local.ts).
 */

/** P0420, C1234, B0001, U0100; allows P 0420 / P-0420 / P.0420. */
export const DTC_CODE_REGEX = /\b([PCBU])[\s.\-]{0,2}([0-9A-Fa-f]{4})\b/g;

export function compactDtcInput(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s.\-_]/g, "");
}

export function normalizeDtcCode(raw: string): string | null {
  const m = compactDtcInput(raw).match(/^([PCBU])([0-9A-F]{4})$/);
  if (!m) return null;
  return `${m[1]}${m[2]}`;
}

export function extractDtcCodes(text: string): string[] {
  if (!text) return [];
  const found = new Set<string>();
  const re = new RegExp(DTC_CODE_REGEX.source, "gi");
  for (const m of text.matchAll(re)) {
    const code = normalizeDtcCode(`${m[1]}${m[2]}`);
    if (code) found.add(code);
  }
  return [...found];
}

export function extractDtcCodesFromAny(
  input: string | string[] | null | undefined,
): string[] {
  if (!input) return [];
  if (Array.isArray(input)) {
    const found = new Set<string>();
    for (const item of input) {
      const code = normalizeDtcCode(item);
      if (code) found.add(code);
    }
    return [...found];
  }
  return extractDtcCodes(input);
}

/** Validate a single typed code (modal / Enter code). */
export function isValidDtcInput(raw: string): boolean {
  return Boolean(normalizeDtcCode(raw));
}
