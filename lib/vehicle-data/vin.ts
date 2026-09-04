/** ISO 3779 VIN: 17 chars, no I/O/Q. */

const VIN_TRANSLIT: Record<string, number> = {
  A: 1,
  B: 2,
  C: 3,
  D: 4,
  E: 5,
  F: 6,
  G: 7,
  H: 8,
  J: 1,
  K: 2,
  L: 3,
  M: 4,
  N: 5,
  P: 7,
  R: 9,
  S: 2,
  T: 3,
  U: 4,
  V: 5,
  W: 6,
  X: 7,
  Y: 8,
  Z: 9,
};

const VIN_WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

export function normalizeVin(raw?: string | null): string | null {
  if (!raw) return null;
  const v = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (v.length !== 17) return null;
  if (/[IOQ]/.test(v)) return null;
  return v;
}

/** ISO-3779 / NHTSA check digit (position 9). */
export function vinCheckDigit(vin17: string): string | null {
  const v = vin17.trim().toUpperCase();
  if (v.length !== 17) return null;
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    if (i === 8) continue;
    const ch = v[i];
    const val = /[0-9]/.test(ch) ? Number(ch) : VIN_TRANSLIT[ch];
    if (val === undefined) return null;
    sum += val * VIN_WEIGHTS[i];
  }
  const mod = sum % 11;
  return mod === 10 ? "X" : String(mod);
}

export function vinCheckDigitOk(raw?: string | null): boolean | null {
  const v = normalizeVin(raw);
  if (!v) return null;
  const expected = vinCheckDigit(v);
  if (!expected) return null;
  return v[8] === expected;
}

export type VinClientIssue = {
  code: "length" | "ioq" | "check_digit";
  message: string;
};

/** Client-side VIN hints. Check-digit failure is a warning — hand-fill still works. */
export function describeVinClientIssue(raw?: string | null): VinClientIssue | null {
  const compact = (raw || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!compact) return null;
  if (/[IOQ]/.test(compact)) {
    return {
      code: "ioq",
      message:
        "VIN cannot include I, O, or Q. Fix the characters, or enter year / make / model by hand.",
    };
  }
  if (compact.length !== 17) {
    return {
      code: "length",
      message: `VIN needs 17 characters (${compact.length}/17). You can still fill year / make / model manually.`,
    };
  }
  if (vinCheckDigitOk(compact) === false) {
    return {
      code: "check_digit",
      message:
        "This VIN’s check digit doesn’t match. Decode may still work, or enter year / make / model by hand. Nothing you’ve already typed will be cleared.",
    };
  }
  return null;
}

/** Last 8 only — never log or prompt the full VIN unless the user asked to share it. */
export function maskVin(vin?: string | null): string {
  const v = vin?.trim().toUpperCase() ?? "";
  if (v.length < 8) return "***";
  return `${"*".repeat(v.length - 8)}${v.slice(-8)}`;
}

export function vinLast8(vin?: string | null): string | null {
  const v = vin?.trim().toUpperCase();
  if (!v || v.length < 8) return null;
  return v.slice(-8);
}
