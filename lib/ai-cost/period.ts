/** UTC calendar-month bounds (same period as shop reports / token reset). */

export function utcMonthBounds(d = new Date()): {
  startIso: string;
  endIso: string;
  periodYm: string;
} {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const start = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, m + 1, 1, 0, 0, 0, 0));
  const periodYm = `${y}-${String(m + 1).padStart(2, "0")}`;
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    periodYm,
  };
}
