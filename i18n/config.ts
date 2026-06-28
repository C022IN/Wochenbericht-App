// Central locale config for the website UI.
// IMPORTANT: this affects ONLY what users read on the website.
// The Excel export (lib/export*.ts, lib/calendar.ts, the .xlsx template)
// is always German and must NOT be driven by these settings.

export const LOCALES = ["de", "en", "ru"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "de";

// Cookie that stores the user's chosen UI language.
export const LOCALE_COOKIE = "wb_locale";

// Native label shown in the language switcher.
export const LOCALE_LABELS: Record<Locale, string> = {
  de: "Deutsch",
  en: "English",
  ru: "Русский"
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}
