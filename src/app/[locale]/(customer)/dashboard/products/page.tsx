"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

type Product = {
  _id: string;
  name: string;
  sku: string;
  price: number;
  unit: string;
  isActive: boolean;
};

export default function ProductsPage() {
  const t = useTranslations("products");
  const tCart = useTranslations("cart");
  const tNav = useTranslations("dashboard.nav");
  const locale = useLocale();
  const [products, setProducts] = useState<Product[]>([]);
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
      try {
        const response = await fetch("/api/products");
        const payload = (await response.json()) as {
          success?: boolean;
          data?: Product[];
          message?: string;
        };

        if (response.status === 200 && payload.success && payload.data) {
          setProducts(payload.data);
          return;
        }

        setError(payload.message ?? t("messages.fetchError"));
      } catch {
        setError(t("messages.fetchError"));
      } finally {
        setLoading(false);
      }
    })();
  }, [t]);

  return (
    <main className="ds-page">
      <header className="ds-header-row">
        <div>
          <h1 className="ds-page-title">{t("title")}</h1>
          <p className="ds-page-subtitle">{t("subtitle")}</p>
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

      {loading ? <p className="ds-text-muted">{t("messages.loading")}</p> : null}
      {error ? <p className="ds-error">{error}</p> : null}

      {!loading && !error && products.length === 0 ? <p className="ds-text-muted">{t("messages.empty")}</p> : null}

      {!loading && !error && products.length > 0 ? (
        <ul className="ds-list">
          {products.map((product) => (
            <li key={product._id} className="ds-card ds-stack ds-stack--tight">
              <p className="ds-product-name">{product.name}</p>
              <p className="ds-text-small">
                <strong>{t("fields.price")}:</strong> {product.price} /{" "}
                {product.unit || t("fields.defaultUnit")}
              </p>
              <p className="ds-text-caption">
                {t("fields.sku")}: {product.sku}
              </p>
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
