/**
 * AI Focus Mode — Chat → Dashboard highlight payload
 */

export type FocusPartId =
  | "engine"
  | "brakes"
  | "suspension"
  | "battery"
  | "tires"
  | "hvac"
  | "ac"
  | "transmission"
  | "lights";

export type FocusCommand = {
  type: "focus";
  /** Dashboard region id (ac maps to hvac visually) */
  part: FocusPartId;
  message?: string;
  /** Machine-friendly action slug, e.g. clean_maf_sensor */
  action?: string;
  steps?: string[];
  tools?: string[];
  safetyNotes?: string[];
};

export const FOCUS_PART_IDS: FocusPartId[] = [
  "engine",
  "brakes",
  "suspension",
  "battery",
  "tires",
  "hvac",
  "ac",
  "transmission",
  "lights",
];

/** Map focus part → dashboard region id (shared visuals). */
export function focusPartToRegionId(part: FocusPartId | string): string {
  if (part === "ac") return "hvac";
  return part;
}

export const FOCUS_PART_LABEL =
  "engine | brakes | suspension | battery | tires | hvac | ac | transmission | lights";
