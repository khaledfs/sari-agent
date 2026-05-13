"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, Clock, TrendingUp, ShoppingBag, Home, ShoppingCart as CartIcon } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { typography } from "@/design/typography";
import { PRODUCT_CATEGORIES } from "@/lib/product-categories";
import { PremiumProductCard, SmartSection, PremiumSearchBar } from "@/components/ui/premium/premium-products-page";
import { PremiumNotification } from "@/components/ui/premium/premium-notification";

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
    <>
      {/* Success notification */}
      <PremiumNotification
        show={!!addedId}
        message={tCart("added")}
        onClose={() => setAddedId(null)}
      />

      <main className="min-h-screen bg-gradient-to-br from-[#fafaf8] via-white to-[#faf8f3] relative overflow-hidden">
        {/* Animated background orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute w-[600px] h-[600px] rounded-full bg-gradient-to-r from-[#c9a54c]/10 to-[#d4af37]/10 blur-3xl"
          animate={{
            x: [0, 100, 0],
            y: [0, -50, 0],
          }}
          transition={{ duration: 20, repeat: Infinity }}
          style={{ left: "10%", top: "10%" }}
        />
        <motion.div
          className="absolute w-[500px] h-[500px] rounded-full bg-gradient-to-r from-[#b8962e]/10 to-[#a67c00]/10 blur-3xl"
          animate={{
            x: [0, -100, 0],
            y: [0, 50, 0],
          }}
          transition={{ duration: 15, repeat: Infinity }}
          style={{ right: "10%", bottom: "10%" }}
        />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
            <div>
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-3 mb-2"
              >
                <div className="p-3 bg-gradient-to-br from-[#d4af37] to-[#b8962e] rounded-2xl shadow-[0_8px_20px_rgba(201,165,76,0.3)]">
                  <ShoppingBag className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h1 className="text-4xl font-black bg-gradient-to-r from-[#c9a54c] via-[#d4af37] to-[#b8962e] bg-clip-text text-transparent">
                    {t("title")}
                  </h1>
                </div>
              </motion.div>
              <p className="text-[#4a4639] text-lg ml-16">{t("subtitleCategories")}</p>
            </div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex gap-3"
            >
              <Link href={`/${locale}/dashboard`}>
                <motion.button
                  whileHover={{ scale: 1.05, y: -2 }}
                  whileTap={{ scale: 0.95 }}
                  className="flex items-center gap-2 px-5 py-2.5 bg-white border border-[#e8e4dc] hover:border-[#c9a54c] rounded-xl font-semibold text-[#1a1814] hover:text-[#c9a54c] transition-all shadow-sm hover:shadow-md"
                >
                  <Home className="w-4 h-4" />
                  {tNav("home")}
                </motion.button>
              </Link>
              <Link href={`/${locale}/dashboard/cart`}>
                <motion.button
                  whileHover={{ scale: 1.05, y: -2 }}
                  whileTap={{ scale: 0.95 }}
                  className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-[#d4af37] to-[#b8962e] hover:from-[#c9a54c] hover:to-[#a67c00] rounded-xl font-bold text-white shadow-[0_4px_12px_rgba(201,165,76,0.26)] hover:shadow-[0_6px_16px_rgba(201,165,76,0.34)] transition-all"
                >
                  <CartIcon className="w-4 h-4" />
                  {tCart("goToCart")}
                </motion.button>
              </Link>
            </motion.div>
          </div>

          {/* Error message */}
          <AnimatePresence>
            {smartError && (
              <motion.div
                initial={{ opacity: 0, y: -10, height: 0 }}
                animate={{ opacity: 1, y: 0, height: "auto" }}
                exit={{ opacity: 0, y: -10, height: 0 }}
                className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 font-medium"
              >
                {smartError}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Search bar */}
          <div className="mb-8">
            <PremiumSearchBar
              value={searchTerm}
              onChange={setSearchTerm}
              placeholder={tSmart("searchPlaceholder")}
            />
          </div>
        </motion.header>

        {/* Recent Products */}
        <SmartSection
          title={tSmart("recent")}
          icon={<Clock className="w-5 h-5 text-[#c9a54c]" />}
          products={recentVisible}
          emptyMessage={tSmart("noRecent")}
          loading={rfLoading}
          onAddToCart={addToCart}
          onToggleFavorite={toggleFavorite}
          favoriteIds={favoriteIds}
          addingId={addingId}
          addedId={addedId}
          favBusyId={favBusyId}
        />

        {/* Frequent Products */}
        <SmartSection
          title={tSmart("frequent")}
          icon={<TrendingUp className="w-5 h-5 text-[#c9a54c]" />}
          products={frequentVisible}
          emptyMessage={tSmart("noFrequent")}
          loading={rfLoading}
          onAddToCart={addToCart}
          onToggleFavorite={toggleFavorite}
          favoriteIds={favoriteIds}
          addingId={addingId}
          addedId={addedId}
          favBusyId={favBusyId}
          showFrequency
        />

        {/* Favorite Products */}
        <SmartSection
          title={tSmart("favorites")}
          icon={<Heart className="w-5 h-5 text-[#c9a54c]" />}
          products={favoritesVisible}
          emptyMessage={tSmart("noFavorites")}
          loading={favLoading}
          onAddToCart={addToCart}
          onToggleFavorite={toggleFavorite}
          favoriteIds={favoriteIds}
          addingId={addingId}
          addedId={addedId}
          favBusyId={favBusyId}
        />

        {/* Catalog Products (Search Results) */}
        <AnimatePresence>
          {searchActive && (
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="mb-12"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-gradient-to-br from-[#c9a54c]/20 to-[#b8962e]/20 rounded-xl">
                  <ShoppingBag className="w-5 h-5 text-[#c9a54c]" />
                </div>
                <h2 className="text-2xl font-bold text-[#1a1814]">{t("title")}</h2>
              </div>

              {catalogLoading && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div
                      key={i}
                      className="h-[450px] bg-gradient-to-br from-[#f7f6f3] to-[#eeece6] rounded-[22px] animate-pulse"
                    />
                  ))}
                </div>
              )}

              {!catalogLoading && filteredProducts.length === 0 && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-gradient-to-br from-[#fdf6e3]/50 to-white border border-[#e8e4dc] rounded-2xl p-12 text-center"
                >
                  <p className="text-[#8a8477] text-lg">{t("noProducts")}</p>
                </motion.div>
              )}

              {!catalogLoading && filteredProducts.length > 0 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                >
                  {filteredProducts.map((product, idx) => (
                    <motion.div
                      key={product._id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                    >
                      <PremiumProductCard
                        product={product}
                        onAddToCart={addToCart}
                        onToggleFavorite={toggleFavorite}
                        isFavorite={favoriteIds.has(product._id)}
                        isAdding={addingId === product._id}
                        isAdded={addedId === product._id}
                        isFavBusy={favBusyId === product._id}
                      />
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </motion.section>
          )}
        </AnimatePresence>

        {/* Categories Section */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-12"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-gradient-to-br from-[#c9a54c]/20 to-[#b8962e]/20 rounded-xl">
              <ShoppingBag className="w-5 h-5 text-[#c9a54c]" />
            </div>
            <h2 className="text-2xl font-bold text-[#1a1814]">{t("categories")}</h2>
          </div>

          {loading && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className="h-[200px] bg-gradient-to-br from-[#f7f6f3] to-[#eeece6] rounded-[22px] animate-pulse"
                />
              ))}
            </div>
          )}

          {error && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center"
            >
              <p className="text-red-700 font-medium">{error}</p>
            </motion.div>
          )}

          {!loading && !error && filteredCategories.length === 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-gradient-to-br from-[#fdf6e3]/50 to-white border border-[#e8e4dc] rounded-2xl p-12 text-center"
            >
              <p className="text-[#8a8477] text-lg">{t("noCategories")}</p>
            </motion.div>
          )}

          {!loading && !error && filteredCategories.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredCategories.map((c, idx) => (
                <motion.div
                  key={c.slug}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  whileHover={{ y: -8, scale: 1.02 }}
                  className="group relative h-full"
                >
                  {/* Glow effect */}
                  <div className="absolute -inset-1 bg-gradient-to-r from-[#c9a54c]/20 via-[#d4af37]/20 to-[#b8962e]/20 rounded-[24px] blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                  <Link
                    href={`/${locale}/dashboard/products/${c.slug}`}
                    className="relative block h-full bg-gradient-to-br from-white to-[#faf8f3] border border-[#e8e4dc] rounded-[22px] overflow-hidden shadow-[0_4px_14px_rgba(15,23,42,0.08)] group-hover:shadow-[0_20px_50px_rgba(201,165,76,0.18)] group-hover:border-[#d4cfc4] transition-all duration-300"
                  >
                    <div className="relative aspect-[16/10] overflow-hidden bg-[#f7f6f3]">
                      {c.imageUrl ? (
                        <img
                          src={c.imageUrl}
                          alt={c.displayName[locale as "he" | "en" | "ar"] ?? c.displayName.en}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-[#f7f6f3] via-[#eeece6] to-[#e8e4dc] flex items-center justify-center">
                          <div className="w-20 h-20 rounded-full bg-[#c9a54c]/10 flex items-center justify-center">
                            <ShoppingBag className="w-10 h-10 text-[#c9a54c]/40" />
                          </div>
                        </div>
                      )}

                      {/* Dark overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />

                      {/* Category title */}
                      <div className="absolute bottom-0 left-0 right-0 p-5">
                        <h3 className="text-white font-black text-xl leading-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.4)] group-hover:text-[#fdf6e3] transition-colors">
                          {c.displayName[locale as "he" | "en" | "ar"] ?? c.displayName.en}
                        </h3>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          )}
        </motion.section>
      </div>
    </main>
    </>
  );
}