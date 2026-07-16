"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { composeLocaleHref, LOCALE_LABELS, type AppLocale } from "@/lib/locale-switch";

const GlobeIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
);

/**
 * Globe language dropdown (Work Order Issue 5). Swaps ONLY the locale
 * segment via next-intl's navigation APIs, preserving path, query string and
 * hash; query + hash are read from window.location at click time (avoids a
 * useSearchParams Suspense dependency). The next-intl middleware persists the
 * choice in its NEXT_LOCALE cookie on navigation, so SSR and API agree.
 */
export function LanguageSwitcher() {
  const t = useTranslations("localeSwitcher");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [focusIndex, setFocusIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, close]);

  // Imperative focus only — focusIndex itself is set when the menu opens.
  useEffect(() => {
    if (open) itemRefs.current[focusIndex]?.focus();
  }, [open, focusIndex]);

  function toggleOpen() {
    setOpen((wasOpen) => {
      if (!wasOpen) {
        const current = routing.locales.indexOf(locale as AppLocale);
        setFocusIndex(current >= 0 ? current : 0);
      }
      return !wasOpen;
    });
  }

  function selectLocale(next: AppLocale) {
    close(true);
    if (next === locale) return;
    const href = composeLocaleHref(pathname, window.location.search, window.location.hash);
    // Only the locale segment changes; scroll is kept where reasonable.
    router.replace(href, { locale: next, scroll: false });
  }

  function onMenuKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      close(true);
      return;
    }
    const count = routing.locales.length;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const delta = e.key === "ArrowDown" ? 1 : -1;
      const next = (focusIndex + delta + count) % count;
      setFocusIndex(next);
      itemRefs.current[next]?.focus();
    }
    if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      const next = e.key === "Home" ? 0 : count - 1;
      setFocusIndex(next);
      itemRefs.current[next]?.focus();
    }
  }

  return (
    <div ref={rootRef} className="ds-lang-switcher">
      <button
        ref={triggerRef}
        type="button"
        className="ds-lang-switcher__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("label")}
        title={t("label")}
        onClick={toggleOpen}
        onKeyDown={(e) => {
          if (e.key === "Escape" && open) close(true);
        }}
      >
        <GlobeIcon />
        <span className="ds-lang-switcher__code">{locale.toUpperCase()}</span>
      </button>

      {open ? (
        <div className="ds-lang-switcher__menu" role="menu" aria-label={t("label")} onKeyDown={onMenuKeyDown}>
          {routing.locales.map((option, index) => (
            <button
              key={option}
              ref={(el) => {
                itemRefs.current[index] = el;
              }}
              type="button"
              role="menuitemradio"
              aria-checked={option === locale}
              tabIndex={index === focusIndex ? 0 : -1}
              className={`ds-lang-switcher__item${option === locale ? " ds-lang-switcher__item--current" : ""}`}
              onClick={() => selectLocale(option)}
            >
              <span>{LOCALE_LABELS[option]}</span>
              {option === locale ? <span aria-hidden="true">✓</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
