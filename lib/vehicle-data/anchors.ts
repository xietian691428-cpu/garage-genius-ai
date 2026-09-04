/**
 * Read-only official-fact blocks injected into Chat/Coach context.
 * Does not change CoachScenarioPlayer. Fail-open: any upstream miss → omit that block.
 */

import type { VehicleInfo } from "@/lib/types/chat";
import { formatDiyPathBlock } from "@/lib/diy-check-paths";
import { normalizeVehicleMarket } from "@/lib/types/vehicle-market";
import { formatDtcRefBlock } from "@/lib/vehicle-data/dtc-local";
import {
  fetchEpaMpg,
  isFuelEconomyQuestion,
} from "@/lib/vehicle-data/epa-fueleconomy";
import { fetchRecallsByYmm } from "@/lib/vehicle-data/nhtsa-recalls";
import {
  NHTSA_RECALLS_URL,
  NHTSA_RECALL_EMPTY,
  NHTSA_RECALL_FOOTNOTE,
  NHTSA_RECALL_UNAVAILABLE,
  isNhtsaRecallMarket,
  isRecallQuestion,
  regionalRecallBody,
  regionalRecallTitle,
} from "@/lib/vehicle-data/recall-copy";
import {
  decodeVinValues,
  isFreshVpicSnapshot,
} from "@/lib/vehicle-data/nhtsa-vpic";
import type {
  EpaMpgAnchor,
  RecallQueryResult,
  VpicSnapshot,
} from "@/lib/vehicle-data/types";
import { normalizeVin, vinLast8 } from "@/lib/vehicle-data/vin";

const VERIFY =
  "Official figures are read-only. Do not rewrite NHTSA/EPA numbers. Confirm with the owner's manual and a dealer. This is education, not a repair-completion or coverage decision.";

export type OfficialAnchorVpicStatus = "ok" | "none";
export type OfficialAnchorRecallStatus =
  | "listed"
  | "empty"
  | "unavailable"
  | "regional"
  | "skipped";
export type OfficialAnchorEpaStatus = "ok" | "unavailable" | "skipped";

export type OfficialAnchorStatus = {
  vpic: OfficialAnchorVpicStatus;
  recalls: OfficialAnchorRecallStatus;
  epa: OfficialAnchorEpaStatus;
};

/** Explicit degrade banner so Chat cannot treat a miss as “NHTSA found none”. */
export function formatAnchorStatusBlock(status: OfficialAnchorStatus): string {
  return `[ANCHOR_STATUS] vpic=${status.vpic} recalls=${status.recalls} epa=${status.epa}
Official-source health this turn. If vpic=none, do not claim a fresh NHTSA vPIC decode. If recalls=unavailable or recalls=regional, do not invent campaign numbers and do not claim NHTSA found an empty list. If epa=unavailable or epa=skipped, do not invent EPA MPG. Spec hard rules still apply when sources are degraded.`;
}

function snapshotFromVehicle(vehicle: VehicleInfo): VpicSnapshot | null {
  const snap = vehicle.vpicDecode;
  if (isFreshVpicSnapshot(snap)) return snap;
  return null;
}

export function formatGarageVehicleAnchor(vehicle: VehicleInfo): string {
  return formatVehicleAnchorBlock(vehicle, snapshotFromVehicle(vehicle));
}

export function formatVehicleAnchorBlock(
  vehicle: VehicleInfo,
  vpic: VpicSnapshot | null,
): string {
  const last8 = vinLast8(vehicle.vin);
  const vinLine = last8
    ? `VIN (last 8 only): …${last8}`
    : "VIN: not on file (full VIN is never required in this prompt).";

  if (vpic && (vpic.year || vpic.make || vpic.model)) {
    const bits = [
      vpic.year && `Year: ${vpic.year}`,
      vpic.make && `Make: ${vpic.make}`,
      vpic.model && `Model: ${vpic.model}`,
      vpic.trim && `Trim: ${vpic.trim}`,
      vpic.engine && `Engine: ${vpic.engine}`,
      vpic.driveType && `Drive: ${vpic.driveType}`,
      vpic.transmission && `Transmission: ${vpic.transmission}`,
      vpic.fuelType && `Fuel: ${vpic.fuelType}`,
    ].filter(Boolean);
    return `[VEHICLE_ANCHOR]
Source: NHTSA vPIC (DecodeVinValues) — U.S. government.
${bits.join(" | ")}
${vinLine}
${VERIFY}`;
  }

  return `[VEHICLE_ANCHOR]
Source: garage profile (NHTSA vPIC unavailable this turn).
Year: ${vehicle.year} | Make: ${vehicle.make} | Model: ${vehicle.model}${
    vehicle.engine ? ` | Engine: ${vehicle.engine}` : ""
  }
${vinLine}
${VERIFY}`;
}

export function formatRecallHintsBlock(
  recalls: RecallQueryResult,
): string {
  const ymm = `${recalls.year} ${recalls.make} ${recalls.model}`;
  const header = `[RECALL_HINTS]
Source: NHTSA Recalls API (recallsByVehicle) — U.S. government. Education only.
These campaigns may apply to some ${ymm} vehicles. This list does NOT mean this owner's VIN is unrepaired, that a part must be replaced today, that a shop will/won't cover work, or that the car is unsafe to park. Never say a recall is "already done", "fixed", or "doesn't apply" without the owner checking. Never say "replace now".
Owner action: look up the VIN at ${NHTSA_RECALLS_URL} and/or a dealer. Do not paste a full VIN into this chat.
${NHTSA_RECALL_FOOTNOTE}`;

  if (!recalls.hints.length) {
    return `${header}
${NHTSA_RECALL_EMPTY}
${VERIFY}`;
  }

  const lines = recalls.hints.map((h, i) => {
    const extra = [
      h.reportReceivedDate && `Date: ${h.reportReceivedDate}`,
      h.consequence && `Consequence: ${h.consequence}`,
      h.remedy && `Remedy (official short): ${h.remedy}`,
    ]
      .filter(Boolean)
      .join(" ");
    return `${i + 1}. ${h.campaignNumber} | ${h.component} | ${h.summary}${
      extra ? ` ${extra}` : ""
    }`;
  });
  const more =
    recalls.total > recalls.hints.length
      ? `\nNHTSA lists ${recalls.total} campaign(s) for this year/make/model; showing ${recalls.hints.length}.`
      : "";

  return `${header}
${lines.join("\n")}${more}
${VERIFY}`;
}

export function formatRegionalRecallBlock(
  market: string | null | undefined,
): string {
  return `[RECALL_HINTS]
Source: regional guidance (no NHTSA list). Education only.
${regionalRecallTitle(market)}.
${regionalRecallBody(market)}
Do not invent NHTSA campaign numbers, European campaign IDs, or claim a recall is completed or that a part must be replaced today. Never paste a full VIN into replies — send the owner to the maker site or dealer to enter it themselves.
${VERIFY}`;
}

/** US fetch failed — timeout/error is not an empty campaign list. */
export function formatRecallUnavailableBlock(): string {
  return `[RECALL_HINTS]
Source: NHTSA Recalls API unavailable this turn. Education only.
Status: error/timeout — not an empty campaign list.
${NHTSA_RECALL_UNAVAILABLE}
Do not invent campaign numbers. Do not claim NHTSA found an empty list or that campaigns are completed. Direct the owner to ${NHTSA_RECALLS_URL} with their VIN, or a dealer.
${NHTSA_RECALL_FOOTNOTE}
${VERIFY}`;
}

export function formatEpaMpgBlock(epa: EpaMpgAnchor): string {
  const mpg = [
    epa.cityMpg != null && `city ${epa.cityMpg}`,
    epa.highwayMpg != null && `highway ${epa.highwayMpg}`,
    epa.combinedMpg != null && `combined ${epa.combinedMpg}`,
  ]
    .filter(Boolean)
    .join(" / ");
  return `[EPA_MPG]
Source: EPA FuelEconomy.gov — U.S. government.
Representative option: ${epa.optionLabel}
Official MPG (US): ${mpg}${epa.fuelType ? ` | Fuel: ${epa.fuelType}` : ""}
Ratings vary by trim/powertrain. Do not invent different official MPG numbers.
${VERIFY}`;
}

/** Fuel-economy question but EPA fetch failed — skip numbers, do not invent MPG. */
export function formatEpaUnavailableBlock(): string {
  return `[EPA_MPG]
Source: EPA FuelEconomy.gov unavailable this turn.
Do not invent city, highway, or combined MPG. Direct the owner to the window sticker or fueleconomy.gov for this year/make/model. Confirm with the owner's manual.
${VERIFY}`;
}

export type GatherAnchorsOptions = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Skip network (tests). */
  vpic?: VpicSnapshot | null;
  recalls?: RecallQueryResult | null;
  epa?: EpaMpgAnchor | null;
};

/**
 * Assemble Chat/Coach fact blocks. Never throws; omits blocks on failure.
 */
export async function gatherVehicleFactAnchors(
  vehicle: VehicleInfo,
  userMessage: string,
  options?: GatherAnchorsOptions,
): Promise<string | null> {
  try {
    const stored = snapshotFromVehicle(vehicle);
    const vin = normalizeVin(vehicle.vin);

    const market = normalizeVehicleMarket(vehicle.market);
    const usRecalls = isNhtsaRecallMarket(market);

    const vpicPromise: Promise<VpicSnapshot | null> =
      options && "vpic" in (options || {})
        ? Promise.resolve(options.vpic ?? null)
        : stored
          ? Promise.resolve(stored)
          : vin
            ? decodeVinValues(vin, {
                fetchImpl: options?.fetchImpl,
                timeoutMs: options?.timeoutMs,
              }).then((d) => d)
            : Promise.resolve(null);

    const recallsPromise: Promise<RecallQueryResult | null> =
      options && "recalls" in (options || {})
        ? Promise.resolve(options.recalls ?? null)
        : usRecalls
          ? fetchRecallsByYmm(vehicle.year, vehicle.make, vehicle.model, {
              fetchImpl: options?.fetchImpl,
              timeoutMs: options?.timeoutMs,
            })
          : Promise.resolve(null);

    const wantEpa = isFuelEconomyQuestion(userMessage);
    const epaPromise: Promise<EpaMpgAnchor | null> =
      options && "epa" in (options || {})
        ? Promise.resolve(options.epa ?? null)
        : wantEpa
          ? fetchEpaMpg(vehicle.year, vehicle.make, vehicle.model, {
              fetchImpl: options?.fetchImpl,
              timeoutMs: options?.timeoutMs,
            })
          : Promise.resolve(null);

    const [vpic, recalls, epa] = await Promise.all([
      vpicPromise.catch(() => null),
      recallsPromise.catch(() => null),
      epaPromise.catch(() => null),
    ]);

    const vpicOk = Boolean(vpic && (vpic.year || vpic.make || vpic.model));
    let recallStatus: OfficialAnchorRecallStatus = "skipped";
    const epaStatus: OfficialAnchorEpaStatus = wantEpa
      ? epa
        ? "ok"
        : "unavailable"
      : "skipped";

    const blocks: string[] = [
      formatVehicleAnchorBlock(vehicle, vpic),
    ];
    if (usRecalls) {
      if (recalls) {
        recallStatus = recalls.hints.length ? "listed" : "empty";
        blocks.push(formatRecallHintsBlock(recalls));
      } else {
        recallStatus = "unavailable";
        if (isRecallQuestion(userMessage)) {
          blocks.push(formatRecallUnavailableBlock());
        }
      }
    } else if (isRecallQuestion(userMessage)) {
      recallStatus = "regional";
      blocks.push(formatRegionalRecallBlock(market));
    }
    if (isRecallQuestion(userMessage)) {
      blocks.push(`[RECALL_ANSWER_RULES]
The owner asked about recalls. Answer from [RECALL_HINTS] and [ANCHOR_STATUS] only for THIS garage vehicle (year/make/model/market above).
- If recalls=listed: summarize at most 3 campaigns educationally + point to ${NHTSA_RECALLS_URL} / a dealer with the VIN. Do not say already fixed, replace now, or that a campaign does/doesn't apply to this VIN.
- If recalls=empty: use the empty-list education copy — still send them to NHTSA VIN lookup. Never say the car has never had a recall.
- If recalls=unavailable or regional: say you couldn't verify / use regional checks — never invent NHTSA campaign numbers and never claim a clean empty NHTSA list when status is unavailable.
- Do not digress into an unrelated prior job (oil change, parking brake, jack stands) unless the owner asked about it in this message.`);
    }
    if (wantEpa) {
      if (epa) blocks.push(formatEpaMpgBlock(epa));
      else blocks.push(formatEpaUnavailableBlock());
    }
    const dtc = formatDtcRefBlock(userMessage);
    if (dtc) blocks.push(dtc);
    const diy = formatDiyPathBlock(userMessage, vehicle);
    if (diy) blocks.push(diy);

    const status: OfficialAnchorStatus = {
      vpic: vpicOk ? "ok" : "none",
      recalls: recallStatus,
      epa: epaStatus,
    };
    const body = [
      formatAnchorStatusBlock(status),
      ...blocks.filter(Boolean),
    ].join("\n\n");
    if (!body.trim()) return null;

    return `## Official vehicle facts (read-only anchors)
${VERIFY}

${body}`;
  } catch {
    return null;
  }
}

/** Debug-safe summary (no full VIN). */
export function describeAnchorsForLog(block: string | null): {
  hasVpic: boolean;
  recallCount: number;
  hasDtc: boolean;
  hasEpa: boolean;
  vinMasked?: string;
} {
  const text = block || "";
  const recallCount = (text.match(/^\d+\. /gm) || []).length;
  return {
    hasVpic: /Source: NHTSA vPIC/i.test(text),
    recallCount,
    hasDtc: /\[DTC_REF\]/.test(text),
    hasEpa: /\[EPA_MPG\]/.test(text),
  };
}
