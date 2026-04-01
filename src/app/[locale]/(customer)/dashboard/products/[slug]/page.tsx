"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useParams } from "next/navigation";

type Product = {
  _id: string;
  name: string;
  sku: string;
  price: number;
  unit: string;
  imageUrl?: string;
  isActive: boolean;
  category?: string;
};

type Category = {
  slug: string;
  displayName: { he: string; en: string; ar: string };
};

export default function CategoryProductsPage() {
  const t = useTranslations("products");
  const tCart = useTranslations("cart");
  const tNav = useTranslations("dashboard.nav");
  const locale = useLocale();
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const [products, setProducts] = useState<Product[]>([]);
  const [category, setCategory] = useState<Category | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [addingId, setAddingId] = useState<string | null>(null);
  const [addedId, setAddedId] = useState<string | null>(null);
  const addedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function addToCart(productId: string) {
    setAddingId(productId);
    setError("");
    try {
      const res = await fetch("/api/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, quantity: 1 }),
      });
      const json = (await res.json()) as { success?: boolean; message?: string };
      if (res.status === 401) {
        setError(tCart("error"));
        return;
      }
      if (res.status === 200 && json.success) {
        if (addedTimer.current) {
          clearTimeout(addedTimer.current);
        }
        setAddedId(productId);
        addedTimer.current = setTimeout(() => setAddedId(null), 2500);
        return;
      }
      setError(json.message ?? t("messages.addError"));
    } catch {
      setError(t("messages.addError"));
    } finally {
      setAddingId(null);
    }
  }

  useEffect(() => {
    return () => {
      if (addedTimer.current) {
        clearTimeout(addedTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      try {
        const [catRes, prodRes] = await Promise.all([
          fetch("/api/products/categories"),
          fetch(`/api/products?category=${encodeURIComponent(slug)}`),
        ]);

        const catPayload = (await catRes.json()) as { success?: boolean; data?: Category[]; message?: string };
        if (catRes.status === 200 && catPayload.success && catPayload.data) {
          setCategory(catPayload.data.find((c) => c.slug === slug) ?? null);
        }

        const prodPayload = (await prodRes.json()) as { success?: boolean; data?: Product[]; message?: string };
        if (prodRes.status === 200 && prodPayload.success && prodPayload.data) {
          setProducts(prodPayload.data);
          return;
        }
        setError(prodPayload.message ?? t("messages.fetchError"));
      } catch {
        setError(t("messages.fetchError"));
      } finally {
        setLoading(false);
      }
    })();
  }, [slug, t]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => `${p.name} ${p.sku}`.toLowerCase().includes(q));
  }, [products, query]);

  return (
    <main className="ds-page">
      <header className="ds-header-row">
        <div>
          <h1 className="ds-page-title">
            {category ? (category.displayName[locale as "he" | "en" | "ar"] ?? category.displayName.en) : t("category")}
          </h1>
          <p className="ds-page-subtitle">{t("subtitleCategoryProducts")}</p>
        </div>
        <div className="ds-header-actions">
          <Link href={`/${locale}/dashboard`} className="ds-link">
            {tNav("home")}
          </Link>
          <Link href={`/${locale}/dashboard/products`} className="ds-link">
            {t("allCategories")}
          </Link>
          <Link href={`/${locale}/dashboard/cart`} className="ds-link">
            {tCart("goToCart")}
          </Link>
        </div>
      </header>

      <div className="ds-mb-md">
        <input
          className="ds-input ds-input--search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchProducts")}
          aria-label={t("searchProducts")}
        />
      </div>

      {loading ? <p className="ds-text-muted">{t("messages.loading")}</p> : null}
      {error ? <p className="ds-error">{error}</p> : null}

      {!loading && !error && filtered.length === 0 ? (
        <p className="ds-text-muted">{t("noProducts")}</p>
      ) : null}

      {!loading && !error && filtered.length > 0 ? (
        <ul className="ds-grid ds-grid--2">
          {filtered.map((product) => (
            <li key={product._id} className="ds-card ds-product-card">
              <div className="ds-product-media" aria-hidden="true">
                {product.imageUrl ? (
                  <img
                    src={product.imageUrl}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="ds-product-media-fallback" />
                )}
              </div>
              <div className="ds-product-body">
                <p className="ds-product-name ds-product-name--sm">{product.name}</p>
                <p className="ds-text-small">
                  <strong>{t("fields.price")}:</strong> {product.price} / {product.unit || t("fields.defaultUnit")}
                </p>
                <p className="ds-text-caption">
                  {t("fields.sku")}: {product.sku}
                </p>
              </div>
              <div className="ds-stack ds-stack--tight ds-mt-sm">
                <button
                  type="button"
                  disabled={addingId === product._id}
                  className="ds-btn ds-btn--primary ds-btn--block"
                  onClick={() => addToCart(product._id)}
                >
                  {addingId === product._id ? t("actions.adding") : t("actions.addToCart")}
                </button>
                {addedId === product._id ? (
                  <span className="ds-success-text" role="status">
                    {tCart("added")}
                  </span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </main>
  );
}

