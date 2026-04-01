"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

type Category = {
  slug: string;
  displayName: { he: string; en: string; ar: string };
  imageUrl?: string;
};

export default function ProductsPage() {
  const t = useTranslations("products");
  const tNav = useTranslations("dashboard.nav");
  const locale = useLocale();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch("/api/products/categories");
        const payload = (await response.json()) as {
          success?: boolean;
          data?: Category[];
          message?: string;
        };

        if (response.status === 200 && payload.success && payload.data) {
          setCategories(payload.data);
          return;
        }

        setError(payload.message ?? t("messages.fetchCategoriesError"));
      } catch {
        setError(t("messages.fetchCategoriesError"));
      } finally {
        setLoading(false);
      }
    })();
  }, [t]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) => (c.displayName[locale as "he" | "en" | "ar"] ?? c.displayName.en).toLowerCase().includes(q));
  }, [categories, locale, query]);

  return (
    <main className="ds-page">
      <header className="ds-header-row">
        <div>
          <h1 className="ds-page-title">{t("categories")}</h1>
          <p className="ds-page-subtitle">{t("subtitleCategories")}</p>
        </div>
        <div className="ds-header-actions">
          <Link href={`/${locale}/dashboard`} className="ds-link">
            {tNav("home")}
          </Link>
        </div>
      </header>

      <div className="ds-mb-md">
        <input
          className="ds-input ds-input--search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchCategories")}
          aria-label={t("searchCategories")}
        />
      </div>

      {loading ? <p className="ds-text-muted">{t("messages.loadingCategories")}</p> : null}
      {error ? <p className="ds-error">{error}</p> : null}

      {!loading && !error && filtered.length === 0 ? (
        <p className="ds-text-muted">{t("noCategories")}</p>
      ) : null}

      {!loading && !error && filtered.length > 0 ? (
        <ul className="ds-grid ds-grid--2">
          {filtered.map((c) => (
            <li key={c.slug} className="ds-card ds-category-card">
              <Link href={`/${locale}/dashboard/products/${c.slug}`} className="ds-category-link">
                <div className="ds-category-media" aria-hidden="true">
                  {c.imageUrl ? (
                    <img src={c.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="ds-category-media-fallback" />
                  )}
                </div>
                <p className="ds-product-name">{c.displayName[locale as "he" | "en" | "ar"] ?? c.displayName.en}</p>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </main>
  );
}
