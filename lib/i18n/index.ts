import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import enUS from "@/locales/en-US/common.json";
import es from "@/locales/es/common.json";

export const APP_LOCALES = ["en-US", "es"] as const;
export type AppLocale = (typeof APP_LOCALES)[number];

export const LOCALE_STORAGE_KEY = "garageGenius_locale";

export function isAppLocale(value: string | null | undefined): value is AppLocale {
  return value === "en-US" || value === "es";
}

export function detectInitialLocale(): AppLocale {
  if (typeof window !== "undefined") {
    try {
      const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
      if (isAppLocale(saved)) return saved;
    } catch {
      /* ignore */
    }
    const nav = navigator.language || "";
    if (nav.toLowerCase().startsWith("es")) return "es";
  }
  return "en-US";
}

/** Flatten nested JSON so keys are `coach.title` style via defaultNS nesting. */
const resources = {
  "en-US": { translation: enUS },
  es: { translation: es },
};

let initialized = false;

export function initI18n(locale?: AppLocale) {
  if (initialized) {
    if (locale && i18n.language !== locale) {
      void i18n.changeLanguage(locale);
    }
    return i18n;
  }

  const lng = locale ?? detectInitialLocale();

  void i18n.use(initReactI18next).init({
    resources,
    lng,
    fallbackLng: "en-US",
    supportedLngs: [...APP_LOCALES],
    interpolation: { escapeValue: false },
    returnNull: false,
  });

  initialized = true;
  return i18n;
}

export function persistLocale(locale: AppLocale) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    /* ignore */
  }
  if (typeof document !== "undefined") {
    document.documentElement.lang = locale === "es" ? "es" : "en";
  }
}

export async function setAppLocale(locale: AppLocale) {
  initI18n(locale);
  persistLocale(locale);
  await i18n.changeLanguage(locale);
}

export default i18n;
