import { routing } from "@/i18n/routing";

/**
 * Locale-switch helpers (Work Order Issue 5). Pure and unit-tested; the
 * switcher itself navigates through next-intl's createNavigation router, so
 * the locale segment is never string-spliced.
 */

export type AppLocale = (typeof routing.locales)[number];

/** Native-name labels for the dropdown — every supported locale, no hardcoded pair. */
export const LOCALE_LABELS: Record<AppLocale, string> = {
  en: "English",
  he: "עברית",
  ar: "العربية",
};

/** RTL applies to every RTL locale (he AND ar), not just the primary one. */
export function getDirection(locale: string): "rtl" | "ltr" {
  return locale === "he" || locale === "ar" ? "rtl" : "ltr";
}

/**
 * Composes the navigation target from the locale-less pathname plus the
 * CURRENT query string and hash, so both survive the switch verbatim.
 * `/dashboard/products/butter?page=2` + `#top` → `/dashboard/products/butter?page=2#top`.
 */
export function composeLocaleHref(pathname: string, search: string, hash: string): string {
  const path = pathname || "/";
  const query = search ? (search.startsWith("?") ? search : `?${search}`) : "";
  const fragment = hash ? (hash.startsWith("#") ? hash : `#${hash}`) : "";
  return `${path}${query}${fragment}`;
}

export function isSupportedLocale(locale: string): locale is AppLocale {
  return (routing.locales as readonly string[]).includes(locale);
}
