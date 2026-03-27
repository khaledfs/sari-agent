"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

type CartLineItem = {
  productId: string;
  quantity: number;
  lineTotal: number;
  product: {
    name: string;
    sku: string;
    price: number;
    unit: string;
    imageUrl: string;
  };
};

type CartData = {
  cartId: string;
  userId: string;
  items: CartLineItem[];
  cartTotal: number;
};

export default function CartPage() {
  const t = useTranslations("cart");
  const tOrders = useTranslations("orders");
  const locale = useLocale();
  const router = useRouter();
  const [cart, setCart] = useState<CartData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [clearBusy, setClearBusy] = useState(false);
  const [placeOrderBusy, setPlaceOrderBusy] = useState(false);

  const loadCart = useCallback(async () => {
    setError("");
    try {
      const res = await fetch("/api/cart", { method: "GET" });
      const json = (await res.json()) as {
        success?: boolean;
        data?: CartData;
        message?: string;
      };
      if (res.status === 401) {
        setError(t("error"));
        setCart(null);
        return;
      }
      if (res.status === 200 && json.success && json.data) {
        setCart(json.data);
        return;
      }
      setError(json.message ?? t("error"));
    } catch {
      setError(t("error"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadCart();
  }, [loadCart]);

  async function updateQty(productId: string, nextQty: number) {
    setBusyId(productId);
    setError("");
    try {
      const res = await fetch("/api/cart", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, quantity: nextQty }),
      });
      const json = (await res.json()) as { success?: boolean; data?: CartData; message?: string };
      if (res.status === 401) {
        setError(t("error"));
        return;
      }
      if (res.status === 200 && json.success && json.data) {
        setCart(json.data);
        return;
      }
      setError(json.message ?? t("error"));
    } catch {
      setError(t("error"));
    } finally {
      setBusyId(null);
    }
  }

  async function removeItem(productId: string) {
    setBusyId(productId);
    setError("");
    try {
      const res = await fetch("/api/cart", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      const json = (await res.json()) as { success?: boolean; data?: CartData; message?: string };
      if (res.status === 401) {
        setError(t("error"));
        return;
      }
      if (res.status === 200 && json.success && json.data) {
        setCart(json.data);
        return;
      }
      setError(json.message ?? t("error"));
    } catch {
      setError(t("error"));
    } finally {
      setBusyId(null);
    }
  }

  async function placeOrder() {
    setPlaceOrderBusy(true);
    setError("");
    try {
      const res = await fetch("/api/orders", { method: "POST" });
      const json = (await res.json()) as { success?: boolean; message?: string };
      if (res.status === 401) {
        setError(tOrders("error"));
        return;
      }
      if (res.status === 200 && json.success) {
        router.push(`/${locale}/dashboard/orders`);
        return;
      }
      setError(json.message ?? tOrders("error"));
    } catch {
      setError(tOrders("error"));
    } finally {
      setPlaceOrderBusy(false);
    }
  }

  async function clearAll() {
    setClearBusy(true);
    setError("");
    try {
      const res = await fetch("/api/cart/clear", { method: "POST" });
      const json = (await res.json()) as { success?: boolean; data?: CartData; message?: string };
      if (res.status === 401) {
        setError(t("error"));
        return;
      }
      if (res.status === 200 && json.success && json.data) {
        setCart(json.data);
        return;
      }
      setError(json.message ?? t("error"));
    } catch {
      setError(t("error"));
    } finally {
      setClearBusy(false);
    }
  }

  return (
    <main style={{ width: "100%", maxWidth: "640px", margin: "0 auto", padding: "1rem" }}>
      <div style={{ marginBottom: "1rem", display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
        <h1 style={{ fontSize: "1.35rem", fontWeight: 700, flex: "1 1 auto" }}>{t("title")}</h1>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.65rem", alignItems: "center" }}>
          <Link href={`/${locale}/dashboard/products`} style={{ fontSize: "0.95rem", color: "#2563eb" }}>
            {t("backToProducts")}
          </Link>
          <Link href={`/${locale}/dashboard/orders`} style={{ fontSize: "0.95rem", color: "#2563eb" }}>
            {tOrders("title")}
          </Link>
        </div>
      </div>

      {loading ? <p>{t("loading")}</p> : null}
      {error ? <p style={{ color: "crimson" }}>{error}</p> : null}

      {!loading && cart && cart.items.length === 0 ? (
        <p style={{ color: "#666" }}>{t("empty")}</p>
      ) : null}

      {!loading && cart && cart.items.length > 0 ? (
        <>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "0.75rem" }}>
            {cart.items.map((line) => (
              <li
                key={line.productId}
                style={{
                  border: "1px solid #ddd",
                  borderRadius: "10px",
                  padding: "0.75rem",
                  display: "grid",
                  gap: "0.35rem",
                }}
              >
                <strong>{line.product.name}</strong>
                <span style={{ color: "#666", fontSize: "0.9rem" }}>
                  {t("sku")}: {line.product.sku}
                </span>
                <span>
                  {t("unitPrice")}: {line.product.price} / {line.product.unit || "—"}
                </span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
                  <span>{t("quantity")}:</span>
                  <button
                    type="button"
                    disabled={busyId === line.productId}
                    onClick={() => updateQty(line.productId, line.quantity - 1)}
                    style={{ padding: "0.35rem 0.65rem", minWidth: "2.25rem" }}
                    aria-label={t("decrease")}
                  >
                    −
                  </button>
                  <span style={{ minWidth: "1.5rem", textAlign: "center" }}>{line.quantity}</span>
                  <button
                    type="button"
                    disabled={busyId === line.productId}
                    onClick={() => updateQty(line.productId, line.quantity + 1)}
                    style={{ padding: "0.35rem 0.65rem", minWidth: "2.25rem" }}
                    aria-label={t("increase")}
                  >
                    +
                  </button>
                  <button
                    type="button"
                    disabled={busyId === line.productId}
                    onClick={() => removeItem(line.productId)}
                    style={{ marginInlineStart: "auto", color: "crimson", background: "none", border: "none", textDecoration: "underline", cursor: "pointer" }}
                  >
                    {t("remove")}
                  </button>
                </div>
                <span>
                  {t("lineTotal")}: {line.lineTotal}
                </span>
              </li>
            ))}
          </ul>
          <div style={{ marginTop: "1rem", paddingTop: "0.75rem", borderTop: "1px solid #eee", fontWeight: 600 }}>
            {t("total")}: {cart.cartTotal}
          </div>
          <div style={{ marginTop: "0.75rem", display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
            <button
              type="button"
              disabled={placeOrderBusy || clearBusy}
              onClick={placeOrder}
              style={{
                padding: "0.55rem 0.9rem",
                borderRadius: "8px",
                border: "1px solid #15803d",
                background: placeOrderBusy ? "#e8f5e9" : "#15803d",
                color: placeOrderBusy ? "#1b4332" : "#fff",
                cursor: placeOrderBusy ? "wait" : "pointer",
              }}
            >
              {placeOrderBusy ? tOrders("placingOrder") : tOrders("placeOrder")}
            </button>
            <button
              type="button"
              disabled={clearBusy || placeOrderBusy}
              onClick={clearAll}
              style={{ padding: "0.5rem 0.75rem" }}
            >
              {t("clearCart")}
            </button>
          </div>
        </>
      ) : null}
    </main>
  );
}
