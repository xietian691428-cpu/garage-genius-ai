/**
 * Gold-case scorer — production gates only (no LLM, no GraphRAG).
 * Dimensions: facts | safety_stop | no_replace_now | source_citation | no_invented_specs
 */

import goldCatalog from "@/content/pilot/gold-cases.json";
import { diagnosticToneFailures } from "@/lib/diagnostic-tone";
import { rewriteDiagnosticQuery } from "@/lib/diagnostic-query-rewrite";
import { matchDiyCheckPath } from "@/lib/diy-check-paths";
import { isHighRiskDrivingSituation } from "@/lib/drive-safety";
import { matchStopRules } from "@/lib/safety/stop-rules";
import {
  inventedSpecFailures,
  type SpecAnchorContext,
} from "@/lib/spec-discipline";
import { lookupLocalDtc } from "@/lib/vehicle-data/dtc-local";
import { matchOfflineAssistQuery } from "@/lib/offline-trip-pack/match";
import { formatGarageProfileFluidsForPrompt } from "@/lib/vehicle-manual-frame";
import {
  chunkManualPages,
  extractManualSpecAllowlist,
} from "@/lib/vehicle-manuals";
import { formatImageAnalysisBlock } from "@/lib/vision/format-analysis";
import {
  extractVisionSpecCandidates,
  visionSpecShouldDegrade,
} from "@/lib/vision/spec-label-from-vision";
import type { ImageAnalysis } from "@/lib/vision/types";
import {
  historyConflictsWithVehicleAnchor,
  isolateMessagesForVehicleThreadReset,
  vehicleSelectionMismatch,
} from "@/lib/chat-vehicle-ownership";
import { tripPackStorageKey } from "@/lib/offline-trip-pack/store";
import type { VehicleInfo } from "@/lib/types/chat";

export type GoldDimension =
  | "facts"
  | "safety_stop"
  | "no_replace_now"
  | "source_citation"
  | "no_invented_specs";

export type GoldCaseExpect = {
  stop_rule_ids?: string[];
  do_not_drive?: boolean;
  facts_must_include?: string[];
  dtc_code?: string;
  dtc_system?: string;
  title_includes?: string[];
  check_order_min?: number;
  check_order_forbids?: string[];
  /** Fail only if phrase appears without a nearby never/do not/not. */
  check_order_forbids_unnegated?: string[];
  check_order_mentions_safety_first?: boolean;
  safety_notes_required?: boolean;
  /** Production DIY path id that must win matchDiyCheckPath for this turn. */
  diy_path_id?: string;
  diy_check_order_min?: number;
  diy_check_order_mentions_safety_first?: boolean;
  garage_block_must_include?: string[];
  sample_good_must_include?: string[];
  /** Aligned manual table text — must unlock oil allowlist via preprocess. */
  manual_table_snippet?: string;
  vision_condition?: "clear" | "blurry" | "dark" | "partial" | "unreadable";
  vision_confidence?: number;
  sample_good?: string;
  sample_bad?: string;
  prior_history?: Array<{ role: string; content: string }>;
  pack_user_a?: string;
  pack_user_b?: string;
};

export type GoldCaseRecord = {
  id: string;
  family: string;
  title: string;
  vehicle: {
    id: string;
    year: number;
    make: string;
    model: string;
    market?: string;
    oilCapacity?: string;
    oilViscosity?: string;
    oilCapacitySource?: "user_manual_confirmed" | "user_entered";
    oilViscositySource?: "user_manual_confirmed" | "user_entered";
    coolantSpecText?: string;
    coolantCapacityText?: string;
    coolantSpecSource?: "user_manual_confirmed" | "user_entered";
    coolantCapacitySource?: "user_manual_confirmed" | "user_entered";
    brakeFluidSpecText?: string;
    brakeFluidSpecSource?: "user_manual_confirmed" | "user_entered";
    transmissionKind?: "atf" | "cvt" | "unknown";
    atfSpecText?: string;
    atfSpecSource?: "user_manual_confirmed" | "user_entered";
  };
  other_vehicle?: {
    id: string;
    year: number;
    make: string;
    model: string;
    market?: string;
  };
  user_text: string;
  anchors: {
    manual: boolean;
    garage_fluids_confirmed: boolean;
    obd: "none" | "user_provided" | "live";
  };
  expect: GoldCaseExpect;
  dimensions: Record<GoldDimension, boolean>;
};

export type DimensionResult = {
  dimension: GoldDimension;
  ok: boolean;
  reason?: string;
};

export type GoldCaseScore = {
  id: string;
  family: string;
  ok: boolean;
  dimensions: DimensionResult[];
};

export const GOLD_CASES = goldCatalog.cases as GoldCaseRecord[];
export const GOLD_CASE_DIMENSIONS = goldCatalog.dimensions as GoldDimension[];

function fail(dimension: GoldDimension, reason: string): DimensionResult {
  return { dimension, ok: false, reason };
}

function pass(dimension: GoldDimension): DimensionResult {
  return { dimension, ok: true };
}

function scoreFacts(c: GoldCaseRecord): DimensionResult {
  const dim: GoldDimension = "facts";
  const exp = c.expect;

  if (exp.dtc_code) {
    const dtc = lookupLocalDtc(exp.dtc_code);
    if (!dtc.catalogHit) {
      return fail(dim, `${exp.dtc_code} missing from local DTC catalog`);
    }
    if (exp.dtc_system && dtc.system !== exp.dtc_system) {
      return fail(
        dim,
        `${exp.dtc_code} system=${dtc.system} expected ${exp.dtc_system}`,
      );
    }
    for (const part of exp.title_includes ?? []) {
      if (!dtc.title.includes(part)) {
        return fail(dim, `title missing "${part}": ${dtc.title}`);
      }
    }
    const order = dtc.checkOrder ?? [];
    if (exp.check_order_min && order.length < exp.check_order_min) {
      return fail(
        dim,
        `check_order length ${order.length} < ${exp.check_order_min}`,
      );
    }
    for (const banned of exp.check_order_forbids ?? []) {
      if (order.some((s) => s.includes(banned))) {
        return fail(dim, `check_order contains forbidden "${banned}"`);
      }
    }
    for (const banned of exp.check_order_forbids_unnegated ?? []) {
      const hit = order.find((s) => s.includes(banned));
      if (hit && !/\b(never|do not|don't|not)\b/i.test(hit)) {
        return fail(dim, `check_order has unnegated "${banned}": ${hit}`);
      }
    }
    if (exp.check_order_mentions_safety_first) {
      const first = (order[0] ?? "").toLowerCase();
      if (
        !/flashing|shake|reduce load|do not keep driving|shop/i.test(first)
      ) {
        return fail(dim, `check_order[0] not safety-first: ${order[0]}`);
      }
    }
    if (exp.safety_notes_required && !dtc.safetyNotes) {
      return fail(dim, `${exp.dtc_code} missing safety_notes`);
    }
  }

  for (const needle of exp.facts_must_include ?? []) {
    if (!c.user_text.toLowerCase().includes(needle.toLowerCase())) {
      return fail(dim, `user_text missing fact cue "${needle}"`);
    }
  }

  if (c.family === "cvt_not_atf") {
    if (c.vehicle.transmissionKind !== "cvt") {
      return fail(dim, "vehicle.transmissionKind must be cvt");
    }
  }

  if (c.family === "cross_vehicle") {
    if (!c.other_vehicle?.id || c.other_vehicle.id === c.vehicle.id) {
      return fail(dim, "cross_vehicle needs distinct other_vehicle.id");
    }
  }

  if (exp.diy_path_id) {
    const path = matchDiyCheckPath(c.user_text);
    if (!path) {
      return fail(dim, `diy path ${exp.diy_path_id} not matched`);
    }
    if (path.id !== exp.diy_path_id) {
      return fail(
        dim,
        `diy path matched ${path.id}, expected ${exp.diy_path_id}`,
      );
    }
    if (
      exp.diy_check_order_min &&
      path.checkOrder.length < exp.diy_check_order_min
    ) {
      return fail(
        dim,
        `diy check_order length ${path.checkOrder.length} < ${exp.diy_check_order_min}`,
      );
    }
    if (exp.diy_check_order_mentions_safety_first) {
      const first = (path.checkOrder[0] ?? "").toLowerCase();
      if (
        !/do-not-drive|tow|pull over|shut down|flashing|shake|reduce load|steam|soft|spongy|never open|do not keep driving/i.test(
          first,
        )
      ) {
        return fail(dim, `diy check_order[0] not safety-first: ${path.checkOrder[0]}`);
      }
    }
    const joined = path.checkOrder.concat(path.stopDiy).join(" | ");
    if (/Replace \w+ now/i.test(joined) && !/never Replace/i.test(joined)) {
      return fail(dim, `diy path ${path.id} has unnegated Replace-now`);
    }
  }

  if (exp.manual_table_snippet) {
    const chunks = chunkManualPages([
      { page: 1, text: exp.manual_table_snippet },
    ]);
    const content = chunks.map((ch) => ch.content).join("\n");
    if (!/TABLE_ROWS|\|/.test(content)) {
      return fail(dim, "manual_table_snippet did not produce table structure");
    }
    const allow = extractManualSpecAllowlist([
      {
        id: "gold-table",
        manualId: "gold",
        pageFrom: 1,
        pageTo: 1,
        heading: "Capacities",
        content,
        rank: 1,
      },
    ]);
    if (!allow.oilCapacity || !/4\.8/.test(allow.oilCapacity)) {
      return fail(dim, `table oil capacity not unlocked: ${allow.oilCapacity}`);
    }
    if (!allow.oilViscosity || !/0W-16/i.test(allow.oilViscosity)) {
      return fail(dim, `table oil viscosity not unlocked: ${allow.oilViscosity}`);
    }
  }

  if (c.family === "vision_low_trust_no_invent") {
    const analysis: ImageAnalysis = {
      condition: exp.vision_condition || "blurry",
      confidence: exp.vision_confidence ?? 0.25,
      scene: "fluid_cap_label",
      ocr_text: [],
      dtc_codes: [],
      readings: [],
      objects: ["oil fill cap"],
      safety_flags: ["none"],
      notes: "Unreadable fill-cap photo.",
      housing_guess: "unclear",
      housing_confidence: "low",
    };
    if (!visionSpecShouldDegrade(analysis)) {
      return fail(dim, "blurry vision should degrade for specs");
    }
    if (extractVisionSpecCandidates(analysis).length) {
      return fail(dim, "low-trust vision must not emit spec candidates");
    }
    const block = formatImageAnalysisBlock(analysis, "test-vision");
    if (!/Degraded|retake|insufficient/i.test(block)) {
      return fail(dim, "vision block should ask retake / degrade");
    }
  }

  return pass(dim);
}

function scoreSafetyStop(c: GoldCaseRecord): DimensionResult {
  const dim: GoldDimension = "safety_stop";
  const exp = c.expect;
  // Fuzzy asks: also score rewritten match text (same path as Chat / offline assist).
  const rewritten = rewriteDiagnosticQuery(c.user_text).matchText || c.user_text;
  const hits = [
    ...matchStopRules(c.user_text),
    ...matchStopRules(rewritten),
  ].filter((h, i, arr) => arr.findIndex((x) => x.id === h.id) === i);
  const offline = matchOfflineAssistQuery(c.user_text);
  const drive =
    isHighRiskDrivingSituation(c.user_text) ||
    isHighRiskDrivingSituation(rewritten);

  if (exp.stop_rule_ids?.length) {
    for (const id of exp.stop_rule_ids) {
      if (!hits.some((h) => h.id === id)) {
        return fail(dim, `stop-rule ${id} not matched for user_text`);
      }
    }
  }

  if (exp.do_not_drive === true) {
    if (!(offline.doNotDrive || drive || hits.length > 0)) {
      return fail(dim, "expected do-not-drive / stop-rule hit");
    }
  }

  // DTC educational codes are not always do-not-drive; require safety notes path.
  if (c.family === "p0300") {
    const dtc = lookupLocalDtc("P0300");
    if (!dtc.safetyNotes) {
      return fail(dim, "P0300 must expose safety_notes for flashing MIL");
    }
    if (!/flashing|shake|shop|catalytic/i.test(dtc.safetyNotes)) {
      return fail(dim, "P0300 safety_notes missing hard-shake / flashing cue");
    }
  }

  // Soft cases with no safety expectation still pass when no false do-not-drive required.
  if (exp.sample_bad && /keep driving|limp/i.test(exp.sample_bad)) {
    if (
      exp.do_not_drive &&
      !isHighRiskDrivingSituation(c.user_text) &&
      !offline.doNotDrive
    ) {
      return fail(dim, "bad sample implies drive-on but gates did not stop");
    }
  }

  return pass(dim);
}

function scoreNoReplaceNow(c: GoldCaseRecord): DimensionResult {
  const dim: GoldDimension = "no_replace_now";
  const good = c.expect.sample_good ?? "";
  const bad = c.expect.sample_bad ?? "";

  if (good) {
    const goodFails = diagnosticToneFailures(good);
    if (goodFails.length) {
      return fail(dim, `sample_good tone failures: ${goodFails.join(", ")}`);
    }
  }

  if (bad) {
    const badFails = diagnosticToneFailures(bad);
    const looksLikeReplaceNow =
      /replace (?:the )?\w[\w\s-]{0,40}\s+now\b|it's definitely|must be the|replace all .{0,40} now/i.test(
        bad,
      );
    if (!badFails.length && !looksLikeReplaceNow) {
      return fail(dim, "sample_bad should trigger Replace-now / root-cause tone");
    }
  }

  if (c.expect.dtc_code) {
    const dtc = lookupLocalDtc(c.expect.dtc_code);
    const joined = (dtc.checkOrder ?? []).join(" | ");
    if (/Replace \w+ now/i.test(joined) && !/never Replace/i.test(joined)) {
      return fail(dim, `${c.expect.dtc_code} check_order has unnegated Replace-now`);
    }
  }

  return pass(dim);
}

function garageFluidsFromGoldVehicle(
  v: GoldCaseRecord["vehicle"],
): Parameters<typeof formatGarageProfileFluidsForPrompt>[0] {
  return {
    oilCapacity: v.oilCapacity,
    oilViscosity: v.oilViscosity,
    oilCapacitySource: v.oilCapacitySource,
    oilViscositySource: v.oilViscositySource,
    coolantSpecText: v.coolantSpecText,
    coolantCapacityText: v.coolantCapacityText,
    coolantSpecSource: v.coolantSpecSource,
    coolantCapacitySource: v.coolantCapacitySource,
    brakeFluidSpecText: v.brakeFluidSpecText,
    brakeFluidSpecSource: v.brakeFluidSpecSource,
    transmissionKind: v.transmissionKind,
    atfSpecText: v.atfSpecText,
    atfSpecSource: v.atfSpecSource,
  };
}

function scoreSourceCitation(c: GoldCaseRecord): DimensionResult {
  const dim: GoldDimension = "source_citation";

  if (c.anchors.garage_fluids_confirmed) {
    const block = formatGarageProfileFluidsForPrompt(
      garageFluidsFromGoldVehicle(c.vehicle),
    );
    const hasOwnerFluid =
      Boolean(c.vehicle.atfSpecText) ||
      Boolean(c.vehicle.oilCapacity) ||
      Boolean(c.vehicle.oilViscosity) ||
      Boolean(c.vehicle.coolantSpecText) ||
      Boolean(c.vehicle.coolantCapacityText) ||
      Boolean(c.vehicle.brakeFluidSpecText);
    if (hasOwnerFluid) {
      if (!block.includes("[GARAGE_PROFILE_FLUIDS]")) {
        return fail(dim, "confirmed garage fluids missing prompt block");
      }
      if (
        !/Garage profile \(from your manual\)|Garage profile \(you entered\)/i.test(
          block,
        )
      ) {
        return fail(dim, "garage fluids block missing source citation label");
      }
      if (!/MUST USE/i.test(block)) {
        return fail(dim, "garage fluids block missing MUST USE directive");
      }
      for (const needle of c.expect.garage_block_must_include ?? []) {
        if (!block.includes(needle)) {
          return fail(dim, `garage block missing "${needle}"`);
        }
      }
    }
  }

  for (const needle of c.expect.sample_good_must_include ?? []) {
    if (!(c.expect.sample_good ?? "").includes(needle)) {
      return fail(dim, `sample_good missing required cite/value "${needle}"`);
    }
  }

  if (!c.anchors.garage_fluids_confirmed && !c.anchors.manual) {
    const empty = formatGarageProfileFluidsForPrompt({});
    if (empty.trim()) {
      return fail(dim, "no-anchor case unexpectedly produced garage fluids block");
    }
    // Capacity / invent-spec families must explicitly refuse guessing.
    if (
      c.family === "no_anchor_oil_capacity" ||
      c.family === "overheat_steam"
    ) {
      const good = c.expect.sample_good ?? "";
      if (
        good &&
        !/manual|fill cap|garage|do not guess|will not invent|dipstick|without .{0,40}anchor/i.test(
          good,
        )
      ) {
        return fail(
          dim,
          "no-anchor sample_good should tell owner to use manual/cap (not invent)",
        );
      }
    }
  }

  if (c.anchors.obd === "user_provided") {
    // Carry / OBD honesty: cases must not claim live when user_provided
    const good = c.expect.sample_good ?? "";
    if (/live OBD|source=live/i.test(good)) {
      return fail(dim, "user_provided OBD sample must not claim live");
    }
  }

  return pass(dim);
}

function scoreNoInventedSpecs(c: GoldCaseRecord): DimensionResult {
  const dim: GoldDimension = "no_invented_specs";
  const good = c.expect.sample_good ?? "";
  const bad = c.expect.sample_bad ?? "";

  let allow: SpecAnchorContext | undefined = c.anchors
    .garage_fluids_confirmed
    ? {
        oilCapacity: c.vehicle.oilCapacity,
        oilViscosity: c.vehicle.oilViscosity,
        coolantCapacity: c.vehicle.coolantCapacityText,
        brakeFluidSpec: c.vehicle.brakeFluidSpecText,
        atfSpec: c.vehicle.atfSpecText,
      }
    : undefined;

  if (c.family === "manual_table_oil" && c.expect.manual_table_snippet) {
    const chunks = chunkManualPages([
      { page: 1, text: c.expect.manual_table_snippet },
    ]);
    const content = chunks.map((ch) => ch.content).join("\n");
    allow = extractManualSpecAllowlist([
      {
        id: "gold-table",
        manualId: "gold",
        pageFrom: 1,
        pageTo: 1,
        heading: "Capacities",
        content,
        rank: 1,
      },
    ]);
  }

  if (good) {
    const fails = inventedSpecFailures(good, allow);
    if (fails.length) {
      return fail(dim, `sample_good invented specs: ${fails.join(", ")}`);
    }
  }

  if (
    bad &&
    (c.family === "no_anchor_oil_capacity" ||
      c.family === "overheat_steam" ||
      c.family === "p0420" ||
      c.family === "cvt_not_atf" ||
      c.family === "anchored_oil_cite" ||
      c.family === "anchored_coolant_brake_cite" ||
      c.family === "manual_table_oil" ||
      c.family === "vision_low_trust_no_invent")
  ) {
    const fails = inventedSpecFailures(bad, allow);
    if (!fails.length && !/replace .+ now|any ATF is fine|bleed/i.test(bad)) {
      return fail(dim, "sample_bad should invent specs or banned ATF substitute");
    }
  }

  if (c.family === "vision_low_trust_no_invent" && good) {
    if (!/retake|blurry|will not invent|do not invent|unclear/i.test(good)) {
      return fail(dim, "vision low-trust sample_good should refuse invent / ask retake");
    }
  }

  return pass(dim);
}

function scoreCrossVehicle(c: GoldCaseRecord): DimensionResult[] {
  const current = {
    make: c.vehicle.make,
    model: c.vehicle.model,
  };
  const history = c.expect.prior_history ?? [];
  const conflicts = historyConflictsWithVehicleAnchor(history, current);

  const isolated = isolateMessagesForVehicleThreadReset(
    [
      { role: "assistant", content: "Civic oil 3.7 qt" },
      { role: "user", content: c.user_text },
    ],
    true,
  );

  const keyA = tripPackStorageKey(
    c.expect.pack_user_a ?? "user-a",
    c.vehicle.id,
  );
  const keyB = tripPackStorageKey(
    c.expect.pack_user_b ?? "user-b",
    c.vehicle.id,
  );
  const keyOther = tripPackStorageKey(
    c.expect.pack_user_a ?? "user-a",
    c.other_vehicle!.id,
  );

  return [
    conflicts
      ? pass("facts")
      : fail(
          "facts",
          "prior Honda Civic oil talk should conflict with Toyota Camry anchor",
        ),
    isolated.length === 1 && isolated[0]?.role === "user"
      ? pass("safety_stop")
      : fail(
          "safety_stop",
          "vehicleThreadReset must keep only latest user turn (zero-carry)",
        ),
    // Isolation itself is the safety/tone contract for this family
    pass("no_replace_now"),
    vehicleSelectionMismatch(c.vehicle.id, c.other_vehicle?.id)
      ? pass("source_citation")
      : fail("source_citation", "header/request vehicle ids must mismatch"),
    keyA !== keyB && keyA !== keyOther
      ? pass("no_invented_specs")
      : fail(
          "no_invented_specs",
          "trip pack / manual keys must isolate user_id × vehicle_id",
        ),
  ];
}

/** Score one gold case across opted-in dimensions. */
export function scoreGoldCase(c: GoldCaseRecord): GoldCaseScore {
  const dimensions = (
    c.family === "cross_vehicle"
      ? scoreCrossVehicle(c)
      : [
          scoreFacts(c),
          scoreSafetyStop(c),
          scoreNoReplaceNow(c),
          scoreSourceCitation(c),
          scoreNoInventedSpecs(c),
        ]
  ).filter((d) => c.dimensions[d.dimension] !== false);

  return {
    id: c.id,
    family: c.family,
    ok: dimensions.every((d) => d.ok),
    dimensions,
  };
}

export function scoreAllGoldCases(): GoldCaseScore[] {
  return GOLD_CASES.map(scoreGoldCase);
}

export function formatGoldCaseReport(scores: GoldCaseScore[]): string {
  const lines: string[] = [];
  for (const s of scores) {
    const mark = s.ok ? "PASS" : "FAIL";
    lines.push(`${mark} · ${s.id} (${s.family})`);
    for (const d of s.dimensions) {
      if (!d.ok) {
        lines.push(`  ✗ ${d.dimension}: ${d.reason}`);
      }
    }
  }
  const failed = scores.filter((s) => !s.ok);
  lines.push(
    `--- ${scores.length - failed.length}/${scores.length} passed · ${failed.length} failed ---`,
  );
  return lines.join("\n");
}

/** Lightweight vehicle stub for callers that need VehicleInfo shape. */
export function goldVehicleStub(
  v: GoldCaseRecord["vehicle"],
): Pick<
  VehicleInfo,
  | "id"
  | "name"
  | "year"
  | "make"
  | "model"
  | "market"
  | "transmissionKind"
  | "atfSpecText"
  | "atfSpecSource"
  | "mileage"
> {
  return {
    id: v.id,
    name: `${v.year} ${v.make} ${v.model}`,
    year: v.year,
    make: v.make,
    model: v.model,
    market: v.market as VehicleInfo["market"],
    transmissionKind: v.transmissionKind,
    atfSpecText: v.atfSpecText,
    atfSpecSource: v.atfSpecSource,
    mileage: 1,
  };
}
