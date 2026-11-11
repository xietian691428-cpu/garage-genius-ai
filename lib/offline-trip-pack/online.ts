/** Lightweight online detection for Trip Pack / Chat CTA. */

export function isBrowserOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine !== false;
}

export function shouldOfferOfflineAssist(opts: {
  networkError: boolean;
  hasPackForVehicle: boolean;
}): boolean {
  if (!opts.hasPackForVehicle) return false;
  if (opts.networkError) return true;
  return !isBrowserOnline();
}
