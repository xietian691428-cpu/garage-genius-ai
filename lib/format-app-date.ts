/**
 * Product-facing dates/numbers follow the in-app language (en-US / es),
 * not the browser locale — so a US DIY user never sees 2026/8/19 or ISO 2026-08-18.
 */

export type AppDateLocale = "en-US" | "es";

export function appDateLocale(lang?: string | null): AppDateLocale {
  if (lang === "en-US" || lang === "es") return lang;
  if (lang?.toLowerCase().startsWith("es")) return "es";
  return "en-US";
}

export function formatAppDate(
  value: Date | string | number,
  lang?: string | null,
): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(appDateLocale(lang), {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Date-only strings (`YYYY-MM-DD`) without UTC-shift to the previous calendar day. */
export function formatAppDateOnly(
  isoDate: string,
  lang?: string | null,
): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate.trim());
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return formatAppDate(d, lang);
  }
  return formatAppDate(isoDate, lang) || isoDate;
}

export function formatAppTime(value: Date, lang?: string | null): string {
  return value.toLocaleTimeString(appDateLocale(lang), {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatAppNumber(n: number, lang?: string | null): string {
  return n.toLocaleString(appDateLocale(lang));
}
