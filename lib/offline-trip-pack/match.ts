import {
  DRIVE_SAFETY_COPY,
  isHighRiskDrivingSituation,
} from "@/lib/drive-safety";
import { rewriteDiagnosticQuery } from "@/lib/diagnostic-query-rewrite";
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
  if (/\brunning\s+hot\b/.test(t)) return true;
  return false;
}

/** Map free-text / shortcut queries to static edu card ids (no AI). */
function matchEduCardIds(text: string): string[] {
  const t = text.toLowerCase();
  const ids: string[] = [];
  if (
    isOverheatSteamSituation(text) ||
    /\boverheat/.test(t) ||
    /\bsteam\b/.test(t)
  ) {
    ids.push("overheat_observe");
  }
  if (
    (/\bsoft\b/.test(t) && /\bbrake/.test(t)) ||
    /\bspongy\b/.test(t) ||
    /\bmushy\b/.test(t) ||
    /\bbrake\s+warning\b/.test(t)
  ) {
    ids.push("soft_brake_observe");
  }
  if (
    /\bflat\s+tire\b/.test(t) ||
    /\bpuncture\b/.test(t) ||
    /\blow\s+tire\b/.test(t) ||
    /\bblowout\b/.test(t)
  ) {
    ids.push("flat_tire_observe");
  }
  if (
    /\bbattery\b/.test(t) ||
    /\bno\s+crank\b/.test(t) ||
    /\bclick\s+only\b/.test(t) ||
    /\bwon'?t\s+start\b/.test(t) ||
    /\bhard\s+start\b/.test(t)
  ) {
    ids.push("battery_jump_observe");
  }
  if (
    /\bP030[0-8]\b/i.test(text) ||
    /\bmisfir/.test(t) ||
    /\bflashing\s+(?:cel|check\s+engine|mil)\b/.test(t) ||
    /\bhard\s+shake\b/.test(t) ||
    /\bengine\s+shak/.test(t)
  ) {
    ids.push("misfire_observe");
  }
  return [...new Set(ids)];
}

/**
 * Local-only assist matcher. Reuses production stop-rules + drive-safety + DTC catalog.
 * Never invents specs or calls AI. Fuzzy asks get light rewrite first.
 */
export function matchOfflineAssistQuery(query: string): OfflineAssistMatch {
  const raw = query?.trim() ?? "";
  const rewrite = rewriteDiagnosticQuery(raw);
  const text = rewrite.matchText || raw;
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
    eduCardIds: matchEduCardIds(text),
  };
}

export function offlineDoNotDriveCopy(): string {
  return DRIVE_SAFETY_COPY.doNotDrive;
}
