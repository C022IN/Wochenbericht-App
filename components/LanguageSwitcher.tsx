"use client";

import { useRouter } from "next/navigation";
import { startTransition, useState, type ChangeEvent } from "react";
import { useLocale } from "next-intl";
import { LOCALES, LOCALE_COOKIE, LOCALE_LABELS, type Locale } from "@/i18n/config";

// One year, so the chosen UI language sticks across visits.
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export function LanguageSwitcher() {
  const router = useRouter();
  const activeLocale = useLocale() as Locale;
  const [value, setValue] = useState<Locale>(activeLocale);

  function handleChange(e: ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as Locale;
    setValue(next);
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
    // Re-render server components with the new locale (no full reload).
    startTransition(() => router.refresh());
  }

  return (
    <select
      className="lang-switcher"
      value={value}
      onChange={handleChange}
      aria-label="Language"
      style={{ width: "auto" }}
    >
      {LOCALES.map((loc) => (
        <option key={loc} value={loc}>
          {LOCALE_LABELS[loc]}
        </option>
      ))}
    </select>
  );
}
