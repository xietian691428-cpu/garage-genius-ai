"use client";

import { useEffect, type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import i18n, { detectInitialLocale, initI18n, persistLocale } from "@/lib/i18n";

initI18n();

export default function I18nProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const locale = detectInitialLocale();
    persistLocale(locale);
    if (i18n.language !== locale) {
      void i18n.changeLanguage(locale);
    }
  }, []);

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
