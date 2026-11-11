/**
 * Offline OBD code cache — always source=offline_session (never live).
 */

import type { OfflineObdSessionCache } from "@/lib/offline-trip-pack/types";

const PREFIX = "gg_offline_obd_session:";

function storageKey(vehicleId: string): string {
  return `${PREFIX}${vehicleId}`;
}

export function saveOfflineObdSession(
  vehicleId: string,
  codes: string[],
): OfflineObdSessionCache {
  const row: OfflineObdSessionCache = {
    vehicleId,
    codes: [...new Set(codes.map((c) => c.trim().toUpperCase()).filter(Boolean))],
    source: "offline_session",
    capturedAt: new Date().toISOString(),
  };
  if (typeof sessionStorage !== "undefined") {
    try {
      sessionStorage.setItem(storageKey(vehicleId), JSON.stringify(row));
    } catch {
      /* quota */
    }
  }
  return row;
}

export function loadOfflineObdSession(
  vehicleId: string,
): OfflineObdSessionCache | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(storageKey(vehicleId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OfflineObdSessionCache;
    if (parsed.vehicleId !== vehicleId) return null;
    return {
      ...parsed,
      source: "offline_session",
    };
  } catch {
    return null;
  }
}

/** Text to paste into Chat as user-provided — never claims live OBD. */
export function formatOfflineObdForOnlineChat(
  session: OfflineObdSessionCache,
): string {
  const codes = session.codes.join(", ");
  return `Codes from an offline OBD session (user-provided, not live adapter): ${codes}`;
}
