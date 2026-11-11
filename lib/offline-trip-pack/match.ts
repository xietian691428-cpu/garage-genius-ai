import {
  DRIVE_SAFETY_COPY,
  isHighRiskDrivingSituation,
} from "@/lib/drive-safety";
import { matchStopRules } from "@/lib/safety/stop-rules";
import { extractDtcCodes } from "@/lib/dtc-parse";
import { lookupLocalDtc } from "@/lib/vehicle-data/dtc-local";
import type { OfflineAssistMatch } from "@/lib/offline-trip-pack/types";

function isOverheatSteamSituation(text: string): boolean {
  const t = text.toLowerCase();
  if (/\bsteam\b/.test(t)) return true;
  if (/\bgauge\s+(?:in\s+)?red\b/.test(t)) return true;
  if (/\boverheat(?:ing)?\b/.test(t) && /\b(steam|red|temp)\b/.test(t)) {
    return true;
  }
  return false;
}

/**
 * Local-only assist matcher. Reuses production stop-rules + drive-safety + DTC catalog.
 * Never invents specs or calls AI.
 */
export function matchOfflineAssistQuery(query: string): OfflineAssistMatch {
  const text = query?.trim() ?? "";
  const stopRuleHits = matchStopRules(text);
  const driveSafetyHit = isHighRiskDrivingSituation(text);
  const overheatSteam = isOverheatSteamSituation(text);

  const doNotDrive =
    driveSafetyHit ||
    overheatSteam ||
    stopRuleHits.some(
      (r) =>
        r.id === "hot_cooling_cap" ||
        r.id === "brake_hydraulics_abs" ||
        r.id === "hv_orange_hybrid",
    );

  const codes = extractDtcCodes(text);
  const dtcRefs = codes.map((code) => {
    const r = lookupLocalDtc(code);
    return {
      code: r.code,
      title: r.title,
      summary: r.summary,
      catalogHit: r.catalogHit,
      checkOrder: r.checkOrder ?? [],
      safetyNotes: r.safetyNotes,
      commonCauses: r.commonCauses,
    };
  });

  return {
    query: text,
    stopRuleHits,
    driveSafetyHit,
    doNotDrive,
    dtcRefs,
  };
}

export function offlineDoNotDriveCopy(): string {
  return DRIVE_SAFETY_COPY.doNotDrive;
}
