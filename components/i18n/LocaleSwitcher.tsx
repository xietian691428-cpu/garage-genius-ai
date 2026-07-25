"use client";

import { useTranslation } from "react-i18next";
import {
  APP_LOCALES,
  isAppLocale,
  setAppLocale,
  type AppLocale,
} from "@/lib/i18n";

/** Compact locale switcher for Settings / Account. */
export default function LocaleSwitcher() {
  const { t, i18n } = useTranslation();
  const current = (isAppLocale(i18n.language) ? i18n.language : "en-US") as AppLocale;

  return (
    <label className="block text-sm text-slate-400">
      {t("locale.label")}
      <select
        value={current}
        onChange={(e) => {
          const next = e.target.value;
          if (isAppLocale(next)) void setAppLocale(next);
        }}
        className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-200 focus:border-cyan-400 focus:outline-none"
      >
        {APP_LOCALES.map((code) => (
          <option key={code} value={code}>
            {t(`locale.${code}`)}
          </option>
        ))}
      </select>
    </label>
  );
}
