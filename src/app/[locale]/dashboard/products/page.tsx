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
    <main style={{ width: "100%", maxWidth: "860px", margin: "0 auto", padding: "1rem" }}>
      <header style={{ marginBottom: "1rem" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "baseline", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ fontSize: "1.4rem", fontWeight: 700 }}>{t("title")}</h1>
            <p style={{ color: "#666", marginTop: "0.25rem" }}>{t("subtitle")}</p>
          </div>
          <Link href={`/${locale}/dashboard/cart`} style={{ fontSize: "0.95rem", color: "#2563eb" }}>
            {tCart("goToCart")}
          </Link>
        </div>
      </header>

      {loading ? <p>{t("messages.loading")}</p> : null}
      {error ? <p style={{ color: "crimson" }}>{error}</p> : null}

      {!loading && !error && products.length === 0 ? (
        <p>{t("messages.empty")}</p>
      ) : null}

      {!loading && !error && products.length > 0 ? (
        <section style={{ display: "grid", gap: "0.75rem" }}>
          {products.map((product) => (
            <article
              key={product._id}
              style={{
                border: "1px solid #ddd",
                borderRadius: "10px",
                padding: "0.75rem",
                display: "grid",
                gap: "0.35rem",
              }}
            >
              <strong style={{ fontSize: "1rem" }}>{product.name}</strong>
              <span style={{ color: "#444" }}>
                {t("fields.price")}: {product.price} / {product.unit || t("fields.defaultUnit")}
              </span>
              <span style={{ color: "#777" }}>
                {t("fields.sku")}: {product.sku}
              </span>
              <div style={{ marginTop: "0.5rem", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                <button
                  type="button"
                  disabled={addingId === product._id}
                  onClick={() => addToCart(product._id)}
                  style={{
                    padding: "0.55rem 0.8rem",
                    borderRadius: "8px",
                    border: "1px solid #2563eb",
                    background: addingId === product._id ? "#e8eefc" : "#2563eb",
                    color: addingId === product._id ? "#1e3a5f" : "#fff",
                    textAlign: "center",
                    cursor: addingId === product._id ? "wait" : "pointer",
                  }}
                >
                  {addingId === product._id ? t("actions.adding") : t("actions.addToCart")}
                </button>
                {addedId === product._id ? (
                  <span style={{ fontSize: "0.9rem", color: "#15803d" }} role="status">
                    {tCart("added")}
                  </span>
                ) : null}
              </div>
            </article>
          ))}
        </section>
      ) : null}
    </main>
  );
}

