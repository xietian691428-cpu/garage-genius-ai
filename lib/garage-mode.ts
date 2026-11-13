/** High-contrast outdoor display. Optional; default theme stays as-is. */
export const GARAGE_MODE_STORAGE_KEY = "gg-garage-mode";
export const GARAGE_MODE_CLASS = "gg-garage-mode";

export function readGarageMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(GARAGE_MODE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function applyGarageMode(on: boolean): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle(GARAGE_MODE_CLASS, on);
  try {
    window.localStorage.setItem(GARAGE_MODE_STORAGE_KEY, on ? "1" : "0");
  } catch {
    /* private mode */
  }
}
