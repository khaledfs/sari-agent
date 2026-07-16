"use client";

import { useEffect } from "react";

/**
 * Keeps <html lang/dir> in sync with the active locale (Work Order Issue 5).
 * The root layout sits above the [locale] segment and cannot know the locale
 * server-side without restructuring; setting the attributes in an effect adds
 * them without any hydration mismatch (they are absent in server markup).
 */
export function HtmlLangSync({ locale, dir }: { locale: string; dir: "rtl" | "ltr" }) {
  useEffect(() => {
    document.documentElement.setAttribute("lang", locale);
    document.documentElement.setAttribute("dir", dir);
  }, [locale, dir]);
  return null;
}
