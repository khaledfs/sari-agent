"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useParams } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { useAccountStatus } from "@/components/account-status/account-status-provider";
import { emitCartAdd } from "@/components/living-bakery/micro";
import { useRealtimeRefetch } from "@/components/realtime/realtime-provider";
import { typography } from "@/design/typography";
import { PRODUCT_CATEGORIES } from "@/lib/product-categories";

type Product = {
  _id: string;
  name: string;
  sku: string;
  price: number;
  unit: string;
  imageUrl?: string;
  isActive: boolean;
  category?: string;
  /** null/undefined = stock not tracked; 0 = tracked and sold out. */
  stock?: number | null;
};

type Category = {
  slug: string;
  displayName: { he: string; en: string; ar: string };
};

export default function CategoryProductsPage() {
  const t = useTranslations("products");
  const tCart = useTranslations("cart");
  const tNav = useTranslations("dashboard.nav");
  const tRestricted = useTranslations("restricted");
  const { restricted, notifyRestricted } = useAccountStatus();
  const locale = useLocale();
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const [products, setProducts] = useState<Product[]>([]);
  const [meta, setMeta] = useState<{ page: number; totalPages: number } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [addingId, setAddingId] = useState<string | null>(null);
  const [addedId, setAddedId] = useState<string | null>(null);
  const addedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const category = useMemo((): Category | null => {
    const c = PRODUCT_CATEGORIES.find((x) => x.slug === slug);
    return c ? { slug: c.slug, displayName: c.displayName } : null;
  }, [slug]);

  async function addToCart(productId: string) {
    setAddingId(productId);
    setError("");
    try {
      const res = await fetch("/api/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, quantity: 1 }),
      });
      const json = (await res.json()) as { success?: boolean; message?: string; code?: string };
      if (res.status === 401) {
        setError(tCart("error"));
        return;
      }
      if (res.status === 403 && json.code === "ACCOUNT_RESTRICTED") {
        notifyRestricted();
        setError(tRestricted("actionBlocked"));
        return;
      }
      if (res.status === 200 && json.success) {
        if (addedTimer.current) {
          clearTimeout(addedTimer.current);
        }
        setAddedId(productId);
        emitCartAdd();
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

  const fetchPage = useCallback(
    async (page: number, append: boolean, silent = false) => {
      if (append) setLoadingMore(true);
      else if (!silent) {
        setLoading(true);
        setError("");
      }
      try {
        const params = new URLSearchParams({ category: slug, page: String(page) });
        const prodRes = await fetch(`/api/products?${params.toString()}`);
        const prodPayload = (await prodRes.json()) as {
          success?: boolean;
          data?: Product[];
          meta?: { page: number; totalPages: number };
          message?: string;
        };
        if (prodRes.status === 200 && prodPayload.success && prodPayload.data) {
          const items = prodPayload.data;
          setProducts((prev) => (append ? [...prev, ...items] : items));
          setMeta(prodPayload.meta ? { page: prodPayload.meta.page, totalPages: prodPayload.meta.totalPages } : null);
          return;
        }
        if (!append) setError(prodPayload.message ?? t("messages.fetchError"));
      } catch {
        if (!append) setError(t("messages.fetchError"));
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [slug, t]
  );

  useEffect(() => {
    void fetchPage(1, false);
  }, [fetchPage]);

  // Live catalog updates: silently refresh the first page (keeps stale data
  // visible — never a loader). Deeper Load-More pages refresh on next demand.
  useRealtimeRefetch(["product.updated", "inventory.updated"], () => {
    if (!meta || meta.page === 1) void fetchPage(1, false, true);
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => `${p.name} ${p.sku}`.toLowerCase().includes(q));
  }, [products, query]);

  return (
    <main className="ds-page ds-page--ambient-band">
      <header className="ds-header-row">
        <div>
          <h1 className="ds-page-title">
            <span className={typography.h2}>
              {category ? (category.displayName[locale as "he" | "en" | "ar"] ?? category.displayName.en) : t("category")}
            </span>
          </h1>
          <p className={`ds-page-subtitle ${typography.body}`}>{t("subtitleCategoryProducts")}</p>
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
        <Input
          search
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
        <ul className="ds-grid ds-grid--2 ds-grid--products">
          {filtered.map((product) => (
            <Card
              as="li"
              key={product._id}
              className="ds-product-card ds-product-card--redesign group"
            >
              <div className="ds-product-media" aria-hidden="true">
                {product.imageUrl ? (
                  <Image
                    src={product.imageUrl}
                    alt=""
                    width={200}
                    height={200}
                    referrerPolicy="no-referrer"
                    className="ds-product-media__img"
                  />
                ) : (
                  <div className="ds-product-media-fallback" />
                )}
              </div>

              <div className="ds-product-body">
                <p className="ds-product-name ds-product-name--sm">{product.name}</p>

                <p className="ds-product-price">
                  ₪ {product.price} / {product.unit || t("fields.defaultUnit")}
                </p>

                <p className="ds-text-caption">
                  {t("fields.sku")}: {product.sku}
                </p>
              </div>

              <div className="ds-stack ds-stack--tight ds-mt-sm">
                {product.stock === 0 ? (
                  <span className="ds-out-of-stock-badge">{t("outOfStock")}</span>
                ) : null}
                <Button
                  variant="primary"
                  block
                  disabled={addingId === product._id || product.stock === 0 || restricted}
                  title={restricted ? tRestricted("actionBlocked") : undefined}
                  onClick={() => addToCart(product._id)}
                >
                  {product.stock === 0
                    ? t("outOfStock")
                    : addingId === product._id
                      ? t("actions.adding")
                      : t("actions.addToCart")}
                </Button>

                {addedId === product._id ? (
                  <span className="ds-success-text" role="status">
                    {tCart("added")}
                  </span>
                ) : null}
              </div>
            </Card>
          ))}
        </ul>
      ) : null}

      {!loading && !error && meta && meta.page < meta.totalPages ? (
        <div className="ds-mt-sm">
          <Button
            variant="secondary"
            block
            disabled={loadingMore}
            onClick={() => void fetchPage(meta.page + 1, true)}
          >
            {loadingMore ? t("messages.loading") : t("loadMore")}
          </Button>
        </div>
      ) : null}
    </main>
  );
}