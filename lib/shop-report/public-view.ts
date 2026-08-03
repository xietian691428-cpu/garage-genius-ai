import type { ShopReportPayload } from "@/lib/types/shop-report";

/** Strip full VIN for public / shared views. */
export function toPublicShopReportPayload(
  payload: ShopReportPayload,
): ShopReportPayload {
  return {
    ...payload,
    vehicle: {
      ...payload.vehicle,
      vinFull: null,
    },
  };
}

export function isShopReportExpired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return true;
  const t = new Date(expiresAt).getTime();
  if (Number.isNaN(t)) return true;
  return t <= Date.now();
}
