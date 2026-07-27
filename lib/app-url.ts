/** Canonical production origin (no trailing slash). */
export const PRODUCTION_APP_ORIGIN = "https://garagegenius.cloud";

/** Canonical production host. */
export const PRODUCTION_APP_HOST = "garagegenius.cloud";

/**
 * Public site origin for Stripe redirects, OAuth, metadata, etc.
 * Prefer `NEXT_PUBLIC_APP_URL`; otherwise request origin; else production domain.
 */
export function getAppBaseUrl(fallbackOrigin?: string | null): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  const fromReq = fallbackOrigin?.trim().replace(/\/$/, "");
  if (fromReq) return fromReq;
  return PRODUCTION_APP_ORIGIN;
}
