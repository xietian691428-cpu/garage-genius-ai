/**
 * System map URL schemes — does not parse Apple/Google offline map databases.
 */

export type MapSearchKind = "tow" | "repair";

function queryFor(kind: MapSearchKind): string {
  return kind === "tow" ? "tow truck near me" : "auto repair near me";
}

/** Prefer platform-appropriate scheme; always safe to open in a new tab / Browser. */
export function systemMapSearchUrl(
  kind: MapSearchKind,
  platform: "ios" | "android" | "web" = "web",
): string {
  const q = encodeURIComponent(queryFor(kind));
  if (platform === "ios") {
    return `https://maps.apple.com/?q=${q}`;
  }
  if (platform === "android") {
    return `https://www.google.com/maps/search/?api=1&query=${q}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

export function telHref(phone: string): string | null {
  const digits = phone.replace(/[^\d+]/g, "").trim();
  if (digits.length < 7) return null;
  return `tel:${digits}`;
}

/** Haversine distance in km; null if coords missing. */
export function straightLineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
