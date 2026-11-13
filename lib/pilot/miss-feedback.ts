/**
 * Production miss feedback — classify, desensitize, draft gold cases.
 * Does NOT auto-edit stop-rules, DIY paths, or CoachScenarioPlayer.
 */

import { diagnosticToneFailures } from "@/lib/diagnostic-tone";
import {
  diyPathHintFromRewrite,
  intentHintFromRewrite,
  rewriteDiagnosticQuery,
} from "@/lib/diagnostic-query-rewrite";
import { isHighRiskDrivingSituation } from "@/lib/drive-safety";
import { matchStopRules } from "@/lib/safety/stop-rules";
import { hashUserIdForObserve } from "@/lib/safety-observe-events";
import { inventedSpecFailures } from "@/lib/spec-discipline";
import type { SpecAnchorContext } from "@/lib/spec-discipline";
import type { GoldCaseRecord } from "@/lib/pilot/gold-case-score";
import goldCatalog from "@/content/pilot/gold-cases.json";

export const MISS_DIMENSIONS = [
  "safety_stop",
  "invented_specs",
  "citation_miss",
  "replace_now",
  "cross_vehicle",
  "user_correction",
  "other",
] as const;

export type MissDimension = (typeof MISS_DIMENSIONS)[number];

export type MissSeverity = "low" | "medium" | "high" | "critical";

export type MissFeedbackStatus =
  | "pending"
  | "reviewed"
  | "promoted_draft"
  | "dismissed";

export type MissFeedbackRecord = {
  id?: string;
  createdAt?: string;
  status: MissFeedbackStatus;
  dimensions: MissDimension[];
  severity: MissSeverity;
  intentSnippet: string;
  replyDigest: string;
  userHash?: string;
  vehicleYmm?: string;
  route: string;
  appVersion?: string;
  goldCatalogVersion?: number;
  diyPathHint?: string | null;
  manualIntentHint?: string | null;
  stopRuleIds: string[];
  hadGarageFluids: boolean;
  gatesRepaired: boolean;
  notes?: string | null;
  goldDraft?: unknown;
  source: "chat_auto" | "admin_manual" | "user_report";
};

const STOP_CUE_RE =
  /\b(do not drive|don't drive|tow|pull over|never open|hot (?:radiator|cap|coolant)|soft (?:brake )?pedal|arrange a (?:tow|shop)|stop DIY|professional)\b/i;

const CITE_CUE_RE =
  /\b(garage profile|from your manual|confirmed manual spec|you entered|your manual)\b/i;

function looksLikeVin(value: string): boolean {
  const t = value.trim().toUpperCase();
  return t.length === 17 && /^[A-HJ-NPR-Z0-9]{17}$/.test(t);
}

/** Strip VIN / email / long digit runs; clip length. */
export function desensitizeText(raw: string, max = 220): string {
  let s = (raw || "")
    .replace(/\b[A-HJ-NPR-Z0-9]{17}\b/gi, "[VIN]")
    .replace(
      /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi,
      "[email]",
    )
    .replace(/\b\d{10,}\b/g, "[digits]")
    .replace(/\s+/g, " ")
    .trim();
  if (looksLikeVin(s)) return "[VIN]";
  if (s.length > max) s = `${s.slice(0, max - 1)}…`;
  return s;
}

export function isMissDimension(v: unknown): v is MissDimension {
  return typeof v === "string" && (MISS_DIMENSIONS as readonly string[]).includes(v);
}

export function severityForDimensions(
  dims: MissDimension[],
): MissSeverity {
  if (dims.includes("safety_stop") || dims.includes("cross_vehicle")) {
    return "critical";
  }
  if (dims.includes("invented_specs") || dims.includes("replace_now")) {
    return "high";
  }
  if (dims.includes("citation_miss") || dims.includes("user_correction")) {
    return "medium";
  }
  return "low";
}

export type ClassifyChatMissInput = {
  userText: string;
  /** Model reply before output gates (preferred for miss detection). */
  rawReply: string;
  /** Reply after gates (optional) — if cleaner, mark gatesRepaired. */
  gatedReply?: string;
  specCtx?: SpecAnchorContext | null;
  hadGarageFluids?: boolean;
  crossVehicleSuspected?: boolean;
  userReportedCorrection?: boolean;
  userId?: string | null;
  vehicleYmm?: string | null;
  route?: string;
  appVersion?: string;
};

/**
 * Rule-only miss classifier. Empty dimensions → no enqueue.
 */
export function classifyChatMiss(
  input: ClassifyChatMissInput,
): MissFeedbackRecord | null {
  const userText = input.userText || "";
  const raw = input.rawReply || "";
  if (!userText.trim() || !raw.trim()) return null;

  const dims: MissDimension[] = [];
  const rewrite = rewriteDiagnosticQuery(userText);
  const matchBlob = rewrite.matchText || userText;
  const stopHits = [
    ...matchStopRules(userText),
    ...matchStopRules(matchBlob),
  ].filter((h, i, a) => a.findIndex((x) => x.id === h.id) === i);
  const highRisk =
    isHighRiskDrivingSituation(userText) ||
    isHighRiskDrivingSituation(matchBlob);

  // 1) Safety: stop-rule / high-risk ask but raw reply lacks stop cues
  if ((stopHits.length > 0 || highRisk) && !STOP_CUE_RE.test(raw)) {
    dims.push("safety_stop");
  }

  // 2) Invented specs (no / insufficient anchors)
  if (inventedSpecFailures(raw, input.specCtx ?? undefined).length > 0) {
    dims.push("invented_specs");
  }

  // 3) Citation miss when garage fluids present and ask is fluid-ish
  const fluidAsk =
    /\b(oil|coolant|brake fluid|atf|cvt|transmission fluid|viscosity|quarts?|how much)\b/i.test(
      matchBlob,
    );
  if (
    input.hadGarageFluids &&
    fluidAsk &&
    !CITE_CUE_RE.test(raw)
  ) {
    dims.push("citation_miss");
  }

  // 4) Replace-now tone
  if (diagnosticToneFailures(raw).length > 0) {
    dims.push("replace_now");
  }

  // 5) Cross-vehicle
  if (input.crossVehicleSuspected) {
    dims.push("cross_vehicle");
  }

  // 6) Explicit user correction report
  if (input.userReportedCorrection) {
    dims.push("user_correction");
  }

  if (!dims.length) return null;

  const gated = input.gatedReply || "";
  const gatesRepaired =
    Boolean(gated) &&
    ((dims.includes("invented_specs") &&
      inventedSpecFailures(gated, input.specCtx ?? undefined).length === 0) ||
      (dims.includes("replace_now") &&
        diagnosticToneFailures(gated).length === 0) ||
      (dims.includes("safety_stop") && STOP_CUE_RE.test(gated)));

  return {
    status: "pending",
    dimensions: [...new Set(dims)],
    severity: severityForDimensions(dims),
    intentSnippet: desensitizeText(userText, 200),
    replyDigest: desensitizeText(raw, 280),
    userHash: hashUserIdForObserve(input.userId),
    vehicleYmm: input.vehicleYmm
      ? desensitizeText(input.vehicleYmm, 80)
      : undefined,
    route: input.route || "chat",
    appVersion: input.appVersion,
    goldCatalogVersion: Number(
      (goldCatalog as { version?: number }).version ?? 1,
    ),
    diyPathHint: diyPathHintFromRewrite(rewrite),
    manualIntentHint: intentHintFromRewrite(rewrite),
    stopRuleIds: stopHits.map((h) => h.id),
    hadGarageFluids: Boolean(input.hadGarageFluids),
    gatesRepaired,
    source: input.userReportedCorrection ? "user_report" : "chat_auto",
  };
}

export function logMissFeedback(record: MissFeedbackRecord): void {
  try {
    console.info("[miss-feedback]", {
      dimensions: record.dimensions,
      severity: record.severity,
      userHash: record.userHash,
      vehicleYmm: record.vehicleYmm,
      diyPathHint: record.diyPathHint,
      manualIntentHint: record.manualIntentHint,
      stopRuleIds: record.stopRuleIds,
      hadGarageFluids: record.hadGarageFluids,
      gatesRepaired: record.gatesRepaired,
      goldCatalogVersion: record.goldCatalogVersion,
      appVersion: record.appVersion,
      route: record.route,
      intentSnippet: record.intentSnippet,
      replyDigest: record.replyDigest,
    });
  } catch {
    /* never throw */
  }
}

export function missFeedbackMetadata(
  record: MissFeedbackRecord | null,
): { missFeedback: string[] } | Record<string, never> {
  if (!record?.dimensions.length) return {};
  return { missFeedback: record.dimensions };
}

/**
 * Build a gold-case shaped draft for human review.
 * Does not write gold-cases.json — caller exports / merges manually.
 */
export function draftGoldCaseFromMiss(
  record: MissFeedbackRecord,
  opts?: { idSuffix?: string },
): GoldCaseRecord {
  const suffix =
    opts?.idSuffix ||
    (record.id ? record.id.slice(0, 8) : String(Date.now()).slice(-6));
  const familyBase = record.dimensions[0] || "other";
  const ymm = (record.vehicleYmm || "2019 Honda Civic").trim();
  const ymmParts = ymm.split(/\s+/);
  const year = Number(ymmParts[0]) || 2019;
  const make = ymmParts[1] || "Honda";
  const model = ymmParts.slice(2).join(" ") || "Civic";

  const diy =
    record.diyPathHint === "soft_brake" ||
    record.diyPathHint === "overheat_steam" ||
    record.diyPathHint === "misfire_random" ||
    record.diyPathHint === "hard_start"
      ? record.diyPathHint
      : undefined;

  const expect: GoldCaseRecord["expect"] = {
    sample_good:
      "HUMAN: write a safe educational sample that passes gates (cite garage/manual when anchored; stop-drive when safety).",
    sample_bad: record.replyDigest || "Replace X now with invented 4.5 qt.",
  };

  if (record.dimensions.includes("safety_stop") || diy === "soft_brake") {
    expect.do_not_drive = true;
    if (record.stopRuleIds.length) {
      expect.stop_rule_ids = record.stopRuleIds.slice(0, 3);
    }
  }
  if (diy) {
    expect.diy_path_id = diy;
    expect.diy_check_order_min = 3;
    expect.diy_check_order_mentions_safety_first = true;
  }
  if (record.dimensions.includes("citation_miss") && record.hadGarageFluids) {
    expect.sample_good_must_include = [
      "Garage profile (from your manual)",
    ];
  }

  return {
    id: `gold_miss_${familyBase}_${suffix}`,
    family: `miss_${familyBase}`,
    title: `Miss feedback draft (${record.dimensions.join(", ")})`,
    vehicle: {
      id: `veh-miss-${suffix}`,
      year,
      make,
      model,
      market: "US",
    },
    user_text: record.intentSnippet || "desensitized intent",
    anchors: {
      manual: record.hadGarageFluids,
      garage_fluids_confirmed: record.hadGarageFluids,
      obd: "none",
    },
    expect,
    dimensions: {
      facts: true,
      safety_stop: true,
      no_replace_now: true,
      source_citation: true,
      no_invented_specs: true,
    },
  };
}

/** Validate draft has the fields gold CI expects before human merge. */
export function validateGoldCaseDraft(draft: GoldCaseRecord): string[] {
  const errs: string[] = [];
  if (!draft.id?.startsWith("gold_")) errs.push("id must start with gold_");
  if (!draft.family) errs.push("family required");
  if (!draft.user_text?.trim()) errs.push("user_text required");
  if (!draft.expect?.sample_good?.trim()) errs.push("sample_good required");
  if (!draft.expect?.sample_bad?.trim()) errs.push("sample_bad required");
  if (draft.expect.sample_good?.includes("HUMAN:")) {
    errs.push("sample_good still has HUMAN placeholder — fill before merge");
  }
  return errs;
}
