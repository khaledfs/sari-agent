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
  const tNav = useTranslations("dashboard.nav");
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
    <main className="ds-page">
      <div className="ds-header-row">
        <h1 className="ds-page-title">{t("title")}</h1>
        <div className="ds-header-actions">
          <Link href={`/${locale}/dashboard`} className="ds-link">
            {tNav("home")}
          </Link>
          <Link href={`/${locale}/dashboard/products`} className="ds-link">
            {t("backToProducts")}
          </Link>
          <Link href={`/${locale}/dashboard/orders`} className="ds-link">
            {tOrders("title")}
          </Link>
        </div>
      </div>

      {loading ? <p className="ds-text-muted">{t("loading")}</p> : null}
      {error ? <p className="ds-error">{error}</p> : null}

      {!loading && cart && cart.items.length === 0 ? <p className="ds-text-muted">{t("empty")}</p> : null}

      {!loading && cart && cart.items.length > 0 ? (
        <>
          <ul className="ds-list">
            {cart.items.map((line) => (
              <li key={line.productId} className="ds-card ds-stack ds-stack--tight">
                <p className="ds-product-name">{line.product.name}</p>
                <p className="ds-text-caption">
                  {t("sku")}: {line.product.sku}
                </p>
                <p className="ds-text-small">
                  <strong>{t("unitPrice")}:</strong> {line.product.price} /{" "}
                  {line.product.unit || "—"}
                </p>
                <div className="ds-qty-row">
                  <span className="ds-text-small">
                    <strong>{t("quantity")}:</strong>
                  </span>
                  <button
                    type="button"
                    disabled={busyId === line.productId}
                    className="ds-icon-btn"
                    onClick={() => updateQty(line.productId, line.quantity - 1)}
                    aria-label={t("decrease")}
                  >
                    −
                  </button>
                  <span className="ds-qty-value">{line.quantity}</span>
                  <button
                    type="button"
                    disabled={busyId === line.productId}
                    className="ds-icon-btn"
                    onClick={() => updateQty(line.productId, line.quantity + 1)}
                    aria-label={t("increase")}
                  >
                    +
                  </button>
                  <button
                    type="button"
                    disabled={busyId === line.productId}
                    className="ds-btn ds-btn--danger ds-push-end"
                    onClick={() => removeItem(line.productId)}
                  >
                    {t("remove")}
                  </button>
                </div>
                <p className="ds-text-small">
                  <strong>{t("lineTotal")}:</strong> {line.lineTotal}
                </p>
              </li>
            ))}
          </ul>
          <div className="ds-totals-strip">
            <strong>{t("total")}:</strong> {cart.cartTotal}
          </div>
          <div className="ds-actions-row">
            <button
              type="button"
              disabled={placeOrderBusy || clearBusy}
              className="ds-btn ds-btn--primary ds-btn--block"
              onClick={placeOrder}
            >
              {placeOrderBusy ? tOrders("placingOrder") : tOrders("placeOrder")}
            </button>
            <button
              type="button"
              disabled={clearBusy || placeOrderBusy}
              className="ds-btn ds-btn--secondary ds-btn--block"
              onClick={clearAll}
            >
              {t("clearCart")}
            </button>
          </div>
        </>
      ) : null}
    </main>
  );
}
