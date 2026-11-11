/**
 * Trip pack persistence: IndexedDB when available, in-memory fallback (tests / SSR).
 * Key = userId + vehicleId. Never a global shared library.
 */

import type { TripPackManifest } from "@/lib/offline-trip-pack/types";

const DB_NAME = "garage-genius-trip-packs";
const STORE = "packs";
const DB_VERSION = 1;

const memory = new Map<string, TripPackManifest>();

export function tripPackStorageKey(userId: string, vehicleId: string): string {
  return `${userId.trim()}::${vehicleId.trim()}`;
}

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onerror = () => resolve(null);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "key" });
        }
      };
      req.onsuccess = () => resolve(req.result);
    } catch {
      resolve(null);
    }
  });
}

type Row = { key: string; pack: TripPackManifest };

export async function saveTripPack(pack: TripPackManifest): Promise<void> {
  const key = tripPackStorageKey(pack.userId, pack.vehicleId);
  memory.set(key, pack);
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("idb write failed"));
    tx.objectStore(STORE).put({ key, pack } satisfies Row);
  });
  db.close();
}

export async function loadTripPack(
  userId: string,
  vehicleId: string,
): Promise<TripPackManifest | null> {
  const key = tripPackStorageKey(userId, vehicleId);
  const db = await openDb();
  if (!db) return memory.get(key) ?? null;
  const row = await new Promise<Row | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result as Row | undefined);
    req.onerror = () => reject(req.error ?? new Error("idb read failed"));
  });
  db.close();
  if (row?.pack) {
    memory.set(key, row.pack);
    return row.pack;
  }
  return memory.get(key) ?? null;
}

export async function deleteTripPack(
  userId: string,
  vehicleId: string,
): Promise<void> {
  const key = tripPackStorageKey(userId, vehicleId);
  memory.delete(key);
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("idb delete failed"));
    tx.objectStore(STORE).delete(key);
  });
  db.close();
}

/** Test helper */
export function clearTripPackMemoryForTests(): void {
  memory.clear();
}
