/**
 * Offline OBD / looked-up code cache — always source=offline_session (never live).
 */

import type { OfflineObdSessionCache } from "@/lib/offline-trip-pack/types";

const PREFIX = "gg_offline_obd_session:";

function storageKey(vehicleId: string): string {
  return `${PREFIX}${vehicleId}`;
}

function normalizeCodes(codes: string[]): string[] {
  return [
    ...new Set(
      codes
        .map((c) => c.trim().toUpperCase().replace(/[\s.\-_]/g, ""))
        .filter((c) => /^[PCBU][0-9A-F]{4}$/i.test(c)),
    ),
  ];
}

export function saveOfflineObdSession(
  vehicleId: string,
  codes: string[],
): OfflineObdSessionCache {
  const row: OfflineObdSessionCache = {
    vehicleId,
    codes: normalizeCodes(codes),
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

/** Merge looked-up / scanned codes into the offline session for this vehicle. */
export function mergeOfflineObdCodes(
  vehicleId: string,
  codes: string[],
): OfflineObdSessionCache {
  const existing = loadOfflineObdSession(vehicleId);
  const merged = [...(existing?.codes ?? []), ...codes];
  return saveOfflineObdSession(vehicleId, merged);
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
      codes: normalizeCodes(parsed.codes ?? []),
    };
  } catch {
    return null;
  }
}

export function clearOfflineObdSession(vehicleId: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(storageKey(vehicleId));
  } catch {
    /* ignore */
  }
}

/** Text to paste into Chat as user-provided — never claims live OBD. */
export function formatOfflineObdForOnlineChat(
  session: OfflineObdSessionCache,
): string {
  return formatOfflineCodesForOnlineChat(session.codes);
}

/** Carry looked-up / offline codes into online Chat — always user-provided. */
export function formatOfflineCodesForOnlineChat(codes: string[]): string {
  const list = normalizeCodes(codes);
  if (!list.length) {
    return "No offline codes to carry (user-provided, not live adapter).";
  }
  return `Codes from an offline session (user-provided, not live adapter): ${list.join(", ")}`;
}
