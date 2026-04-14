"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { typography } from "@/design/typography";
import { PRODUCT_CATEGORIES } from "@/lib/product-categories";

type Category = {
  slug: string;
  displayName: { he: string; en: string; ar: string };
  imageUrl?: string;
};

type Product = {
  _id: string;
  name: string;
  sku: string;
  price: number;
  unit: string;
  imageUrl?: string;
  category?: string;
  frequency?: number;
};

function categorySearchHaystack(categorySlug: string | undefined): string {
  if (!categorySlug) return "";
  const c = PRODUCT_CATEGORIES.find((x) => x.slug === categorySlug);
  const parts = [categorySlug, c?.displayName.he, c?.displayName.en, c?.displayName.ar].filter(Boolean);
  return parts.join(" ").toLowerCase();
}

function productMatchesQuery(p: Product, q: string): boolean {
  if (!q) return true;
  const cat = categorySearchHaystack(p.category);
  const hay = `${p.name} ${p.sku} ${cat}`.toLowerCase();
  return hay.includes(q);
}

function categoryMatchesQuery(c: Category, locale: string, q: string): boolean {
  if (!q) return true;
  const name = (c.displayName[locale as "he" | "en" | "ar"] ?? c.displayName.en).toLowerCase();
  return name.includes(q) || c.slug.toLowerCase().includes(q);
}

export default function ProductsPage() {
  const t = useTranslations("products");
  const tNav = useTranslations("dashboard.nav");
  const tCart = useTranslations("cart");
  const tSmart = useTranslations("smartOrdering");
  const locale = useLocale();

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [recent, setRecent] = useState<Product[]>([]);
  const [frequent, setFrequent] = useState<Product[]>([]);
  const [favorites, setFavorites] = useState<Product[]>([]);
  const [rfLoading, setRfLoading] = useState(true);
  const [favLoading, setFavLoading] = useState(true);
  const [smartError, setSmartError] = useState("");
  const [catalogProducts, setCatalogProducts] = useState<Product[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [addedId, setAddedId] = useState<string | null>(null);
  const [favBusyId, setFavBusyId] = useState<string | null>(null);
  const addedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const qNorm = searchTerm.trim().toLowerCase();
  const searchActive = qNorm.length > 0;

  const favoriteIds = useMemo(() => new Set(favorites.map((f) => f._id)), [favorites]);

  const refetchFavorites = useCallback(async () => {
    try {
      const res = await fetch("/api/favorites", { method: "GET" });
      if (res.status === 401) {
        setFavorites([]);
        return;
      }
      const json = (await res.json()) as { success?: boolean; data?: Product[] };
      if (res.status === 200 && json.success && json.data) {
        setFavorites(json.data);
        return;
      }
      setFavorites([]);
    } catch {
      setFavorites([]);
    }
  }, []);

  const toggleFavorite = useCallback(
    async (productId: string, makeFavorite: boolean) => {
      setFavBusyId(productId);
      setSmartError("");
      try {
        const res = await fetch("/api/favorites", {
          method: makeFavorite ? "POST" : "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productId }),
        });
        const json = (await res.json()) as { success?: boolean; message?: string };
        if (res.status === 401) {
          setSmartError(tCart("error"));
          return;
        }
        if (res.status === 200 && json.success) {
          await refetchFavorites();
          return;
        }
        setSmartError(json.message ?? tSmart("favoriteError"));
      } catch {
        setSmartError(tSmart("favoriteError"));
      } finally {
        setFavBusyId(null);
      }
    },
    [refetchFavorites, tCart, tSmart]
  );

  const addToCart = useCallback(
    async (productId: string) => {
      setAddingId(productId);
      setSmartError("");
      try {
        const res = await fetch("/api/cart", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productId, quantity: 1 }),
        });
        const json = (await res.json()) as { success?: boolean; message?: string };
        if (res.status === 401) {
          setSmartError(tCart("error"));
          return;
        }
        if (res.status === 200 && json.success) {
          if (addedTimer.current) clearTimeout(addedTimer.current);
          setAddedId(productId);
          addedTimer.current = setTimeout(() => setAddedId(null), 2500);
          return;
        }
        setSmartError(json.message ?? t("messages.addError"));
      } catch {
        setSmartError(t("messages.addError"));
      } finally {
        setAddingId(null);
      }
    },
    [t, tCart]
  );

  useEffect(() => {
    return () => {
      if (addedTimer.current) clearTimeout(addedTimer.current);
    };
  }, []);

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

  useEffect(() => {
    (async () => {
      setRfLoading(true);
      setSmartError("");
      try {
        const [rRes, fRes] = await Promise.all([
          fetch("/api/smart-ordering/recent", { method: "GET" }),
          fetch("/api/smart-ordering/frequent", { method: "GET" }),
        ]);
        if (rRes.status === 401 || fRes.status === 401) {
          setRecent([]);
          setFrequent([]);
          return;
        }
        const rJson = (await rRes.json()) as { success?: boolean; data?: Product[]; message?: string };
        const fJson = (await fRes.json()) as { success?: boolean; data?: Product[]; message?: string };
        if (rRes.status === 200 && rJson.success && rJson.data) setRecent(rJson.data);
        else setRecent([]);
        if (fRes.status === 200 && fJson.success && fJson.data) setFrequent(fJson.data);
        else setFrequent([]);
      } catch {
        setRecent([]);
        setFrequent([]);
      } finally {
        setRfLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      setFavLoading(true);
      try {
        await refetchFavorites();
      } finally {
        setFavLoading(false);
      }
    })();
  }, [refetchFavorites]);

  useEffect(() => {
    (async () => {
      setCatalogLoading(true);
      try {
        const prodRes = await fetch("/api/products");
        const prodPayload = (await prodRes.json()) as { success?: boolean; data?: Product[]; message?: string };
        if (prodRes.status === 200 && prodPayload.success && prodPayload.data) {
          setCatalogProducts(prodPayload.data);
          return;
        }
        setCatalogProducts([]);
      } catch {
        setCatalogProducts([]);
      } finally {
        setCatalogLoading(false);
      }
    })();
  }, []);

  const filteredCategories = useMemo(() => {
    if (!searchActive) return categories;
    return categories.filter((c) => categoryMatchesQuery(c, locale, qNorm));
  }, [categories, locale, qNorm, searchActive]);

  const filteredProducts = useMemo(() => {
    if (!searchActive) return [];
    return catalogProducts.filter((p) => productMatchesQuery(p, qNorm));
  }, [catalogProducts, qNorm, searchActive]);

  const recentVisible = useMemo(
    () => (searchActive ? recent.filter((p) => productMatchesQuery(p, qNorm)) : recent),
    [recent, qNorm, searchActive]
  );
  const frequentVisible = useMemo(
    () => (searchActive ? frequent.filter((p) => productMatchesQuery(p, qNorm)) : frequent),
    [frequent, qNorm, searchActive]
  );
  const favoritesVisible = useMemo(
    () => (searchActive ? favorites.filter((p) => productMatchesQuery(p, qNorm)) : favorites),
    [favorites, qNorm, searchActive]
  );

  function renderFavoriteControls(product: Product, mode: "strip" | "favorites-strip") {
    const isFav = favoriteIds.has(product._id);
    const busy = favBusyId === product._id;

    if (mode === "favorites-strip") {
      return (
        <Button
          variant="secondary"
          block
          disabled={busy}
          onClick={() => void toggleFavorite(product._id, false)}
        >
          {busy ? tSmart("favoriteBusy") : tSmart("removeFavorite")}
        </Button>
      );
    }

    return (
      <Button
        variant="secondary"
        block
        disabled={busy}
        onClick={() => void toggleFavorite(product._id, !isFav)}
      >
        {busy ? tSmart("favoriteBusy") : isFav ? tSmart("removeFavorite") : tSmart("addFavorite")}
      </Button>
    );
  }

  function renderSmartStrip(
    products: Product[],
    source: Product[],
    emptyKey: "noRecent" | "noFrequent" | "noFavorites",
    meta: "frequency" | "none",
    loading: boolean,
    favoriteMode: "none" | "toggle" | "favorites-strip"
  ) {
    if (loading) {
      return <p className="ds-text-muted">{t("messages.loading")}</p>;
    }

    if (products.length === 0) {
      if (searchActive && source.length > 0) {
        return <p className="ds-text-muted">{t("noProducts")}</p>;
      }
      return <p className="ds-text-muted">{tSmart(emptyKey)}</p>;
    }

    return (
      <ul className="ds-smart-strip">
        {products.map((product) => (
          <Card
            as="li"
            key={`${emptyKey}-${product._id}`}
            className="ds-product-card ds-product-card--redesign group"
          >
            <div className="ds-product-media" aria-hidden="true">
              {product.imageUrl ? (
                <img
                  src={product.imageUrl}
                  alt=""
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="ds-product-media__img"
                />
              ) : (
                <div className="ds-product-media-fallback" />
              )}
            </div>

            <div className="ds-product-body">
              <p className="ds-product-name ds-product-name--sm">{product.name}</p>

              {meta === "frequency" && typeof product.frequency === "number" ? (
                <p className="ds-text-caption">{tSmart("orderedQty", { count: product.frequency })}</p>
              ) : null}

              <p className="ds-product-price">
                ₪ {product.price} / {product.unit || t("fields.defaultUnit")}
              </p>

              <p className="ds-text-caption">
                {t("fields.sku")}: {product.sku}
              </p>
            </div>

            <div className="ds-stack ds-stack--tight ds-mt-sm">
              <Button
                variant="primary"
                block
                disabled={addingId === product._id}
                onClick={() => void addToCart(product._id)}
              >
                {addingId === product._id ? t("actions.adding") : t("actions.addToCart")}
              </Button>

              {favoriteMode === "toggle" ? renderFavoriteControls(product, "strip") : null}
              {favoriteMode === "favorites-strip" ? renderFavoriteControls(product, "favorites-strip") : null}

              {addedId === product._id ? (
                <span className="ds-success-text" role="status">
                  {tCart("added")}
                </span>
              ) : null}
            </div>
          </Card>
        ))}
      </ul>
    );
  }

  return (
    <main className="ds-page">
      <header className="ds-header-row">
        <div>
          <h1 className={`ds-page-title ${typography.h2}`}>{t("title")}</h1>
          <p className={`ds-page-subtitle ${typography.body}`}>{t("subtitleCategories")}</p>
        </div>

        <div className="ds-header-actions">
          <Link href={`/${locale}/dashboard`} className="ds-link">
            {tNav("home")}
          </Link>
          <Link href={`/${locale}/dashboard/cart`} className="ds-link">
            {tCart("goToCart")}
          </Link>
        </div>
      </header>

      {smartError ? <p className="ds-error ds-mb-md">{smartError}</p> : null}

      <div className="ds-mb-md">
        <Input
          search
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder={tSmart("searchPlaceholder")}
          aria-label={tSmart("searchPlaceholder")}
        />
      </div>

      <section className="ds-mb-md" aria-labelledby="smart-recent-heading">
        <h2 id="smart-recent-heading" className="ds-smart-section-title">
          {tSmart("recent")}
        </h2>
        {renderSmartStrip(recentVisible, recent, "noRecent", "none", rfLoading, "toggle")}
      </section>

      <section className="ds-mb-md" aria-labelledby="smart-frequent-heading">
        <h2 id="smart-frequent-heading" className="ds-smart-section-title">
          {tSmart("frequent")}
        </h2>
        {renderSmartStrip(frequentVisible, frequent, "noFrequent", "frequency", rfLoading, "toggle")}
      </section>

      <section className="ds-mb-md" aria-labelledby="smart-favorites-heading">
        <h2 id="smart-favorites-heading" className="ds-smart-section-title">
          {tSmart("favorites")}
        </h2>
        {renderSmartStrip(favoritesVisible, favorites, "noFavorites", "none", favLoading, "favorites-strip")}
      </section>

      {searchActive ? (
        <section className="ds-mb-md" aria-labelledby="catalog-products-heading">
          <h2 id="catalog-products-heading" className="ds-section-title">
            {t("title")}
          </h2>

          {catalogLoading ? <p className="ds-text-muted">{t("messages.loading")}</p> : null}

          {!catalogLoading && filteredProducts.length === 0 ? (
            <p className="ds-text-muted">{t("noProducts")}</p>
          ) : null}

          {!catalogLoading && filteredProducts.length > 0 ? (
            <ul className="ds-grid ds-grid--2 ds-grid--products">
              {filteredProducts.map((product) => (
                <Card
                  as="li"
                  key={product._id}
                  className="ds-product-card ds-product-card--redesign group"
                >
                  <div className="ds-product-media" aria-hidden="true">
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt=""
                        loading="lazy"
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
                    <Button
                      variant="primary"
                      block
                      disabled={addingId === product._id}
                      onClick={() => void addToCart(product._id)}
                    >
                      {addingId === product._id ? t("actions.adding") : t("actions.addToCart")}
                    </Button>

                    {renderFavoriteControls(product, "strip")}

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
        </section>
      ) : null}

      <section className="ds-mb-md" aria-labelledby="categories-heading">
        <h2 id="categories-heading" className="ds-section-title">
          {t("categories")}
        </h2>

        {loading ? <p className="ds-text-muted">{t("messages.loadingCategories")}</p> : null}
        {error ? <p className="ds-error">{error}</p> : null}

        {!loading && !error && filteredCategories.length === 0 ? (
          <p className="ds-text-muted">{t("noCategories")}</p>
        ) : null}

        {!loading && !error && filteredCategories.length > 0 ? (
          <ul className="ds-grid ds-grid--2 ds-grid--categories">
            {filteredCategories.map((c) => (
              <Card as="li" key={c.slug} className="ds-category-card">
                <Link href={`/${locale}/dashboard/products/${c.slug}`} className="ds-category-link">
                  <div className="ds-category-media" aria-hidden="true">
                    {c.imageUrl ? (
                      <img src={c.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="ds-category-media-fallback" />
                    )}
                    <div className="ds-category-overlay" />
                    <p className="ds-category-title-on-media">
                      {c.displayName[locale as "he" | "en" | "ar"] ?? c.displayName.en}
                    </p>
                  </div>
                </Link>
              </Card>
            ))}
          </ul>
        ) : null}
      </section>
    </main>
  );
}