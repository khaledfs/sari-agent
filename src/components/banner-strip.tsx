"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

type CustomerBanner = {
  id: string;
  title: string;
  body: string;
  imageUrl: string;
  ctaLabel: string;
  ctaHref: string;
  priority: number;
};

const DISMISSED_KEY = "sari-dismissed-banners";

function readDismissed(): string[] {
  try {
    const raw = sessionStorage.getItem(DISMISSED_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function persistDismissed(ids: string[]) {
  try {
    sessionStorage.setItem(DISMISSED_KEY, JSON.stringify(ids));
  } catch {
    // storage unavailable — dismissal just won't survive navigation
  }
}

/**
 * Dismissible announcement strip at the top of the customer dashboard.
 * Content comes from admin-written banners; dismissal is client-session only
 * (sessionStorage — by design, no schema for it).
 */
export function BannerStrip() {
  const t = useTranslations("banners");
  const [banners, setBanners] = useState<CustomerBanner[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setDismissed(readDismissed());
    (async () => {
      try {
        const res = await fetch("/api/banners");
        const json = (await res.json()) as { success?: boolean; data?: CustomerBanner[] };
        if (res.status === 200 && json.success && Array.isArray(json.data)) {
          setBanners(json.data);
        }
      } catch {
        // decorative feature — fail silent
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  function dismiss(id: string) {
    setDismissed((prev) => {
      const next = [...new Set([...prev, id])];
      persistDismissed(next);
      return next;
    });
  }

  if (!loaded) return null;
  const visible = banners.filter((b) => !dismissed.includes(b.id));
  if (visible.length === 0) return null;

  return (
    <div className="ds-banner-strip" role="region" aria-label={t("regionLabel")}>
      {visible.map((banner, index) => (
        <div
          key={banner.id}
          className="ds-banner"
          style={{ animationDelay: `${index * 90}ms` }}
        >
          {banner.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="ds-banner__img" src={banner.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
          ) : (
            <span className="ds-banner__icon" aria-hidden="true">
              📣
            </span>
          )}
          <div className="ds-banner__text">
            <p className="ds-banner__title">{banner.title}</p>
            {banner.body ? <p className="ds-banner__body">{banner.body}</p> : null}
          </div>
          {banner.ctaHref && banner.ctaHref.startsWith("/") && !banner.ctaHref.startsWith("//") ? (
            <Link href={banner.ctaHref} className="ds-banner__cta">
              {banner.ctaLabel || t("defaultCta")}
            </Link>
          ) : null}
          <button
            type="button"
            className="ds-banner__dismiss"
            onClick={() => dismiss(banner.id)}
            aria-label={t("dismiss")}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
