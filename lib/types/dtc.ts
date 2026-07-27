/**
 * Diagnostic Trouble Code (DTC) types — OBD-II style P/C/B/U codes.
 */

export type DtcSeverity = "Info" | "Low" | "Moderate" | "High";

export type DtcFamily = "P" | "C" | "B" | "U";

export type ParsedDtc = {
  code: string;
  family: DtcFamily;
  desc: string;
  severity: DtcSeverity;
};

export type DtcPlaybookMatch = {
  slug: string;
  reason: string;
};

export type DtcLookupResult = {
  codes: ParsedDtc[];
  primary: ParsedDtc | null;
  playbook: DtcPlaybookMatch | null;
};

export type ObdVisionCode = {
  code: string;
  desc: string;
  severity: DtcSeverity | string;
};

export type ObdVisionAnalysis = {
  codes: ObdVisionCode[];
  warning_lights: string[];
  tool_brand: string | null;
  notes: string | null;
  raw_text_glimpse: string | null;
};
