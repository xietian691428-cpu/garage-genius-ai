/**
 * Shop Report must bind to a garage vehicle the signed-in user owns.
 * Coach-session (no garage id) is allowed without a UUID bind.
 */

import {
  bindChatVehicleIdentity,
  VEHICLE_NOT_OWNED_CODE,
} from "@/lib/chat-vehicle-ownership";
import type { VehicleInfo } from "@/lib/types/chat";

export { VEHICLE_NOT_OWNED_CODE };

export const SHOP_REPORT_SESSION_VEHICLE_ID = "coach-session";

export type ShopReportVehicleBind =
  | { ok: true; vehicle: VehicleInfo; archiveVehicleId: string | null }
  | { ok: false; code: typeof VEHICLE_NOT_OWNED_CODE };

export function isShopReportSessionVehicle(id?: string | null): boolean {
  const trimmed = id?.trim() || "";
  return !trimmed || trimmed === SHOP_REPORT_SESSION_VEHICLE_ID;
}

/**
 * Wrong garage UUID → reject. Owned UUID → garage identity wins (YMM/VIN).
 * Chat always needs a garage `vehicle_id`. Coach may export `coach-session`
 * without archiving to a vehicle.
 */
export function resolveShopReportBoundVehicle(
  requested: VehicleInfo,
  owned: VehicleInfo | null,
  source: "chat" | "coach" = "chat",
): ShopReportVehicleBind {
  if (isShopReportSessionVehicle(requested.id)) {
    if (source === "chat") {
      return { ok: false, code: VEHICLE_NOT_OWNED_CODE };
    }
    return {
      ok: true,
      vehicle: requested,
      archiveVehicleId: null,
    };
  }
  const id = requested.id.trim();
  if (!owned || owned.id !== id) {
    return { ok: false, code: VEHICLE_NOT_OWNED_CODE };
  }
  return {
    ok: true,
    vehicle: bindChatVehicleIdentity(requested, owned),
    archiveVehicleId: owned.id,
  };
}
