/**
 * Local SAE-style DTC catalog (merged JSON files). No paid CarMD / ALLDATA.
 * Chat uses this before DeepSeek so titles are not invented.
 */

import bodyCatalog from "@/content/dtc/body.json";
import chassisCatalog from "@/content/dtc/chassis.json";
import commonCatalog from "@/content/dtc/common.json";
import networkCatalog from "@/content/dtc/network.json";
import usHighfreqCatalog from "@/content/dtc/us-highfreq.json";
import { extractDtcCodes, extractDtcCodesFromAny, normalizeDtcCode } from "@/lib/dtc-parse";
import type { DtcSeverity } from "@/lib/types/dtc";
import type {
  DtcDiyLevel,
  DtcSeverityHint,
  DtcSystem,
  LocalDtcCatalogEntry,
  LocalDtcRef,
} from "@/lib/vehicle-data/types";

const FILE_CATALOGS: unknown[] = [
  commonCatalog,
  usHighfreqCatalog,
  chassisCatalog,
  bodyCatalog,
  networkCatalog,
];

/** Unique unknown-code template — never invent an OEM title. */
export const UNKNOWN_DTC_TITLE =
  "Unknown diagnostic trouble code (see OEM definition for this vehicle)";

export const UNKNOWN_DTC_SUMMARY =
  "Record this code from a scan tool. Do not ignore safety-related warning lights. A dealer or shop can interpret the OEM-specific meaning — this app will not invent a diagnosis, TSB, or parts list from an unknown code.";

function isSystem(v: unknown): v is DtcSystem {
  return (
    v === "powertrain" || v === "body" || v === "chassis" || v === "network"
  );
}

function isHint(v: unknown): v is DtcSeverityHint {
  return v === "low" || v === "medium" || v === "high" || v === "info";
}

function isDiy(v: unknown): v is DtcDiyLevel {
  return (
    v === "observe" || v === "basic" || v === "advanced" || v === "shop"
  );
}

function parseEntry(raw: unknown): LocalDtcCatalogEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const code = normalizeDtcCode(String(rec.code || ""));
  if (!code) return null;
  const title = String(rec.title_en || "").trim();
  const summary = String(rec.summary_en || "").trim();
  if (!title || !summary) return null;
  const causes = Array.isArray(rec.common_causes)
    ? rec.common_causes
        .map((c) => String(c || "").trim())
        .filter(Boolean)
        .slice(0, 6)
    : [];
  const notes = String(rec.safety_notes || "").trim();
  return {
    code,
    title_en: title,
    summary_en: summary,
    system: isSystem(rec.system)
      ? rec.system
      : code[0] === "C"
        ? "chassis"
        : code[0] === "B"
          ? "body"
          : code[0] === "U"
            ? "network"
            : "powertrain",
    severity_hint: isHint(rec.severity_hint) ? rec.severity_hint : "medium",
    common_causes: causes,
    diy_level: isDiy(rec.diy_level) ? rec.diy_level : "basic",
    safety_notes: notes || undefined,
  };
}

function loadCatalog(): Map<string, LocalDtcCatalogEntry> {
  const map = new Map<string, LocalDtcCatalogEntry>();
  for (const file of FILE_CATALOGS) {
    const rows = Array.isArray(file) ? file : [];
    for (const row of rows) {
      const entry = parseEntry(row);
      if (entry) map.set(entry.code, entry);
    }
  }
  return map;
}

const CATALOG = loadCatalog();

export function localDtcCatalogSize(): number {
  return CATALOG.size;
}

export function localDtcCatalogCodes(): string[] {
  return [...CATALOG.keys()].sort();
}

export function severityHintToDtcSeverity(hint: DtcSeverityHint): DtcSeverity {
  switch (hint) {
    case "info":
      return "Info";
    case "low":
      return "Low";
    case "high":
      return "High";
    default:
      return "Moderate";
  }
}

function familySystem(code: string): DtcSystem {
  const f = code[0];
  if (f === "C") return "chassis";
  if (f === "B") return "body";
  if (f === "U") return "network";
  return "powertrain";
}

export function lookupLocalDtc(code: string): LocalDtcRef {
  const normalized =
    normalizeDtcCode(code) || code.trim().toUpperCase().replace(/[\s.\-_]/g, "");
  const extra = CATALOG.get(normalized);
  if (extra) {
    return {
      code: extra.code,
      title: extra.title_en,
      summary: extra.summary_en,
      system: extra.system,
      severityHint: extra.severity_hint,
      severity: severityHintToDtcSeverity(extra.severity_hint),
      commonCauses: extra.common_causes,
      diyLevel: extra.diy_level,
      safetyNotes: extra.safety_notes ?? null,
      edu: extra.summary_en,
      catalogHit: true,
    };
  }
  return {
    code: normalized,
    title: UNKNOWN_DTC_TITLE,
    summary: UNKNOWN_DTC_SUMMARY,
    system: familySystem(normalized),
    severityHint: "medium",
    severity: "Moderate",
    commonCauses: [],
    diyLevel: "shop",
    safetyNotes: null,
    edu: UNKNOWN_DTC_SUMMARY,
    catalogHit: false,
  };
}

export function collectDtcCodesFromBlobs(
  ...blobs: Array<string | string[] | null | undefined>
): string[] {
  const found = new Set<string>();
  for (const blob of blobs) {
    if (!blob) continue;
    if (Array.isArray(blob)) {
      for (const code of extractDtcCodesFromAny(blob)) found.add(code);
      continue;
    }
    for (const code of extractDtcCodes(blob)) found.add(code);
  }
  return [...found];
}

export function lookupLocalDtcsFromText(text: string): LocalDtcRef[] {
  return extractDtcCodes(text).map(lookupLocalDtc);
}

export function lookupLocalDtcs(
  codes: string[],
  extraText?: string,
): LocalDtcRef[] {
  return collectDtcCodesFromBlobs(codes, extraText).map(lookupLocalDtc);
}

function formatRefLine(r: LocalDtcRef): string {
  const hit = r.catalogHit
    ? "local catalog"
    : "generic family (no detailed local entry)";
  const causes =
    r.commonCauses.length > 0
      ? ` Educational checks (not a parts order): ${r.commonCauses.join("; ")}.`
      : "";
  const safety = r.safetyNotes ? ` Safety: ${r.safetyNotes}` : "";
  return `- ${r.code} — ${r.title} (diy_level: ${r.diyLevel}; severity: ${r.severityHint}; ${hit}). ${r.summary}${causes}${safety}`;
}

const EMISSION_CODE_RE =
  /^P04(?:[0-9]{2})|^P0420$|^P0430$|^P2096$|^P219[5-8]$|^P227[0-3]$/;

/** Lower rank = list first. SRS/ABS/shop before catalyst/EVAP. */
export function dtcRefSafetyRank(r: LocalDtcRef): number {
  if (r.system === "body" || r.code.startsWith("B")) return 0;
  if (r.system === "chassis" || r.code.startsWith("C")) return 1;
  if (r.diyLevel === "shop" || r.severityHint === "high" || r.safetyNotes) {
    return 2;
  }
  if (r.system === "network" || r.code.startsWith("U")) return 3;
  if (EMISSION_CODE_RE.test(r.code)) return 5;
  return 4;
}

export function sortDtcRefsForPrompt(refs: LocalDtcRef[]): LocalDtcRef[] {
  return [...refs].sort((a, b) => {
    const d = dtcRefSafetyRank(a) - dtcRefSafetyRank(b);
    if (d !== 0) return d;
    return a.code.localeCompare(b.code);
  });
}

/**
 * [DTC_REF] for Chat. DeepSeek should only sequence checks on top of these titles.
 */
export function formatDtcRefBlock(
  text: string,
  extraCodes?: string[],
): string | null {
  const refs = sortDtcRefsForPrompt(lookupLocalDtcs(extraCodes ?? [], text));
  if (!refs.length) return null;

  const lines = refs.slice(0, 12).map(formatRefLine);
  const hasUnknown = refs.some((r) => !r.catalogHit);
  const hasShop = refs.some((r) => r.diyLevel === "shop");
  const multi = refs.length > 1;

  const structure = multi
    ? `Reply structure (required): list every [DTC_REF] line above first, then check order. Safety-related codes (SRS/ABS/lost-comm, diy_level=shop) before pure emissions (catalyst/EVAP). Meaning → likely causes (list, not a verdict) → checks → when to go to a shop.`
    : `Reply structure (required): Meaning → likely causes (list, not a verdict) → checks → when to go to a shop.`;

  const unknownLine = hasUnknown
    ? `Unknown / generic-family codes use only this template: ${UNKNOWN_DTC_SUMMARY}`
    : `Unknown codes stay generic: record the code, do not ignore safety lights, and use a dealer/shop for OEM-specific meaning.`;

  const shopLine = hasShop
    ? `One or more codes have diy_level=shop: prefer a qualified shop. DIY is observe-only (record codes, lights, symptoms). Do not invent a parts order.`
    : "";

  return `[DTC_REF]
Source: local SAE-style DTC catalog (not OEM, not a paid repair database).
Use title, summary, and diy_level as the starting definition. Order DIY checks from observe → basic → advanced → shop. Do not invent TSBs, OEM part numbers, torque specs, or claim a specific part must be replaced from the code alone.
${structure}
${unknownLine}
${shopLine}
${lines.join("\n")}`.replace(/\n\n+/g, "\n").trim();
}
