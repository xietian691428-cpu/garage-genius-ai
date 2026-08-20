export type AppTab =
  | "dashboard"
  | "chat"
  | "coach"
  | "history"
  | "parts"
  | "settings";

export const APP_TABS: readonly AppTab[] = [
  "dashboard",
  "chat",
  "coach",
  "history",
  "parts",
  "settings",
] as const;

const VALID = new Set<string>(APP_TABS);

export function parseAppTab(value: string | null | undefined): AppTab {
  if (value && VALID.has(value)) return value as AppTab;
  return "dashboard";
}

/** Same path as deep links (`/app?tab=coach`). Dashboard omits `tab`. */
export function appTabHref(
  tab: AppTab,
  current?: URLSearchParams | string | null,
): string {
  const next = new URLSearchParams(
    typeof current === "string"
      ? current
      : current
        ? current.toString()
        : "",
  );
  if (tab === "dashboard") next.delete("tab");
  else next.set("tab", tab);
  const qs = next.toString();
  return qs ? `/app?${qs}` : "/app";
}
