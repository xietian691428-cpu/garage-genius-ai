/**
 * Shop Report NHTSA education block — US only, max 3, fail-open.
 * Does not claim a VIN is unrepaired or that a part must be replaced today.
 */

import type { VehicleInfo } from "@/lib/types/chat";
import {
  SHOP_REPORT_RECALL_MAX,
  type ShopReportRecallEducation,
} from "@/lib/types/shop-report";
import { normalizeVehicleMarket } from "@/lib/types/vehicle-market";
import {
  NHTSA_RECALLS_URL,
  NHTSA_RECALL_EMPTY,
  NHTSA_RECALL_FOOTNOTE,
  NHTSA_RECALL_UNAVAILABLE,
  isNhtsaRecallMarket,
} from "@/lib/vehicle-data/recall-copy";
import type { RecallQueryResult } from "@/lib/vehicle-data/types";

export function shopReportWantsNhtsaRecalls(
  vehicle: Pick<VehicleInfo, "market">,
  includeRecalls?: boolean,
): boolean {
  if (includeRecalls === false) return false;
  return isNhtsaRecallMarket(normalizeVehicleMarket(vehicle.market));
}

export function formatShopReportRecallEducation(
  vehicle: Pick<VehicleInfo, "year" | "make" | "model">,
  recalls: RecallQueryResult | null,
): ShopReportRecallEducation {
  const ymm = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
  const base = {
    source: "nhtsa-recalls" as const,
    ymm,
    lookupUrl: NHTSA_RECALLS_URL,
    footnote: NHTSA_RECALL_FOOTNOTE,
  };

  if (!recalls) {
    return {
      ...base,
      status: "unavailable",
      total: 0,
      hints: [],
    };
  }

  const hints = recalls.hints.slice(0, SHOP_REPORT_RECALL_MAX).map((h) => ({
    campaignNumber: h.campaignNumber,
    component: h.component,
    summary: h.summary,
  }));

  if (!hints.length) {
    return {
      ...base,
      status: "empty",
      total: recalls.total,
      hints: [],
    };
  }

  return {
    ...base,
    status: "listed",
    total: recalls.total,
    hints,
  };
}

export function shopReportRecallEmptyCopy(): string {
  return NHTSA_RECALL_EMPTY;
}

export function shopReportRecallUnavailableCopy(): string {
  return NHTSA_RECALL_UNAVAILABLE;
}
