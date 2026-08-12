/**
 * Modification / non-OEM insurance risk education helpers.
 * Soft reminders only — never auto-adjudicate coverage.
 */

import type { VehicleInfo } from "@/lib/types/chat";

/** Country/region options for Settings + vehicle profile. */
export const INSURANCE_COUNTRY_REGIONS = [
  "United States",
  "United Kingdom",
  "Germany",
  "France",
  "Spain",
  "Italy",
  "Canada",
  "Other",
] as const;

export type InsuranceCountryRegion =
  (typeof INSURANCE_COUNTRY_REGIONS)[number];

/** Common US states (optional when country is United States). */
export const US_STATE_OPTIONS = [
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "FL",
  "GA",
  "HI",
  "IA",
  "ID",
  "IL",
  "IN",
  "KS",
  "KY",
  "LA",
  "MA",
  "MD",
  "ME",
  "MI",
  "MN",
  "MO",
  "MS",
  "MT",
  "NC",
  "ND",
  "NE",
  "NH",
  "NJ",
  "NM",
  "NV",
  "NY",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VA",
  "VT",
  "WA",
  "WI",
  "WV",
  "WY",
  "DC",
] as const;

/** Placeholder / datalist suggestions — not an endorsement. */
export const COMMON_INSURANCE_PROVIDERS = [
  "State Farm",
  "Progressive",
  "GEICO",
  "Allstate",
  "USAA",
  "Liberty Mutual",
  "Farmers",
  "Nationwide",
  "AXA",
  "Allianz",
  "Direct Line",
  "Admiral",
  "Aviva",
  "RSA",
] as const;

/**
 * Human-editable region tip keys (i18n: legal.insurance.regionTips.*).
 * Keep short, educational, and non-authoritative.
 */
export const REGION_TIP_KEYS: Record<string, string> = {
  "United States": "us",
  "United Kingdom": "uk",
  Germany: "de",
  France: "fr",
  Spain: "es",
  Italy: "it",
  Canada: "ca",
  Other: "other",
};

export function normalizeInsuranceCountry(
  value?: string | null,
): InsuranceCountryRegion | "" {
  if (!value?.trim()) return "";
  const match = INSURANCE_COUNTRY_REGIONS.find(
    (r) => r.toLowerCase() === value.trim().toLowerCase(),
  );
  return match ?? "Other";
}

export function vehicleHasModifiedTag(vehicle?: VehicleInfo | null): boolean {
  return (vehicle?.tags || []).some((t) => /mod|tuned|turbo|track|stance/i.test(t));
}

export function hasInsuranceContext(vehicle?: VehicleInfo | null): boolean {
  return Boolean(
    vehicle?.countryRegion?.trim() || vehicle?.insuranceProvider?.trim(),
  );
}

/** Soft-language block for AI system prompts when mods / aftermarket / insurance Qs. */
export const INSURANCE_SOFT_LANGUAGE_PROMPT = `
## Insurance / modifications language (required — education only)
- Modifications and non-OEM / aftermarket parts can affect insurance coverage; rules vary by country, state/province, and insurer.
- Never claim a specific insurer will cover, deny, or guarantee anything.
- Prefer: "may affect coverage", "often subject to policy conditions", "check your policy", "contact your insurer", "disclose modifications".
- Forbidden phrasing (rewrite to neutral education): "will not be covered", "will be covered", "void your insurance", "void your policy", "insurance will pay", "won't pay", "insurance-approved", "insurer accepts this", "safe to skip the shop for insurance", "guaranteed coverage".
- When the topic is brakes, steering, airbags, or structural work: emphasize educational/inspection tone and professional verification before driving; do not assert claim outcomes.
- When recommending aftermarket / non-OEM parts OR discussing mods / upgrades OR when the user asks about insurance impact, include a brief general reminder (may affect coverage — check policy / insurer). Garage Genius AI does not provide insurance or legal advice.
`.trim();

/**
 * Inject saved optional insurance fields into the vehicle health profile.
 * Empty fields are omitted — tips stay generic when unset.
 */
export function formatInsuranceProfileForPrompt(
  vehicle: VehicleInfo,
): string | null {
  const region = vehicle.countryRegion?.trim();
  const state = vehicle.countryState?.trim();
  const provider = vehicle.insuranceProvider?.trim();
  if (!region && !state && !provider) return null;

  const lines = [
    "## Optional insurance context (user-provided — education tips only)",
    "Use only to phrase more relevant general reminders. Never determine claim coverage.",
  ];
  if (region) {
    lines.push(
      `- Country/region: ${region}${state ? ` · State/province: ${state}` : ""}`,
    );
  } else if (state) {
    lines.push(`- State/province: ${state}`);
  }
  if (provider) {
    lines.push(
      `- Insurer name (optional label): ${provider} — suggest contacting them or reviewing the policy; do not invent policy terms.`,
    );
  }
  return lines.join("\n");
}

export function regionTipI18nKey(countryRegion?: string | null): string {
  const normalized = normalizeInsuranceCountry(countryRegion);
  const suffix = normalized ? REGION_TIP_KEYS[normalized] : "other";
  return `legal.insurance.regionTips.${suffix || "other"}`;
}
