/**
 * Explicit auth storage for web + Capacitor WKWebView.
 * Avoids relying on default cookie-oriented paths that can stall on iOS.
 */

type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

const memory = new Map<string, string>();

function memoryStorage(): StorageLike {
  return {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => {
      memory.set(key, value);
    },
    removeItem: (key) => {
      memory.delete(key);
    },
  };
}

function tryLocalStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  try {
    const key = "__gg_auth_storage_probe__";
    window.localStorage.setItem(key, "1");
    window.localStorage.removeItem(key);
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Prefer localStorage; fall back to in-memory if Safari private / blocked. */
export function createAuthStorage(): StorageLike {
  return tryLocalStorage() ?? memoryStorage();
}
