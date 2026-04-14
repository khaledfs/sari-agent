  "use client";

  import Link from "next/link";
  import { useRouter } from "next/navigation";
  import { useCallback, useEffect, useState } from "react";
  import { useLocale, useTranslations } from "next-intl";
  import { Button } from "@/components/ui/Button";
  import { Card } from "@/components/ui/Card";
  import { typography } from "@/design/typography";

  type QtyDraftById = Record<string, string | undefined>;

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
    const [qtyDraft, setQtyDraft] = useState<QtyDraftById>({});

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
          const data = json.data;
          setCart(data);
          setQtyDraft((prev) => {
            const next: QtyDraftById = { ...prev };
            for (const line of data.items ?? []) {
              next[line.productId] = String(line.quantity);
            }
            return next;
          });
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
        setQtyDraft((p) => ({ ...p, [productId]: String(nextQty) }));
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
          const data = json.data;
          setCart(data);
          setQtyDraft((prev) => {
            const next: QtyDraftById = { ...prev };
            for (const line of data.items ?? []) {
              next[line.productId] = String(line.quantity);
            }
            return next;
          });
          return;
        }
        setError(json.message ?? t("error"));
      } catch {
        setError(t("error"));
      } finally {
        setBusyId(null);
      }
    }

    function clampQty(value: number) {
      if (!Number.isFinite(value)) return 1;
      if (value < 1) return 1;
      return Math.floor(value);
    }

    async function commitQty(productId: string) {
      const draft = (qtyDraft[productId] ?? "").trim();
      const parsed = clampQty(Number(draft));
      const current = cart?.items.find((l) => l.productId === productId)?.quantity ?? null;
      setQtyDraft((p) => ({ ...p, [productId]: String(parsed) }));
      if (current == null || parsed === current) return;
      await updateQty(productId, parsed);
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
          <h1 className={`ds-page-title ${typography.h2}`}>{t("title")}</h1>
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
                <Card as="li" key={line.productId} className="ds-stack ds-stack--tight ds-cart-row-card">
                  <div className="ds-product-row">
                    <div className="ds-thumb" aria-hidden="true">
                      {line.product.imageUrl ? (
                        <img
                          src={line.product.imageUrl}
                          alt=""
                          loading="lazy"
                          referrerPolicy="no-referrer"
                        />
                      ) : null}
                    </div>
                    <div className="ds-stack ds-stack--tight" style={{ minWidth: 0 }}>
                      <p className="ds-product-name">{line.product.name}</p>
                      <p className="ds-text-caption">
                        {t("sku")}: {line.product.sku}
                      </p>
                      <p className="ds-text-small">
                        <strong>{t("unitPrice")}:</strong> {line.product.price} /{" "}
                        {line.product.unit || "—"}
                      </p>
                    </div>
                  </div>
                  <div className="ds-qty-row">
                    <span className="ds-text-small">
                      <strong>{t("quantity")}:</strong>
                    </span>
                    <div className="ds-qty-controls" role="group" aria-label={t("quantity")}>
                      <button
                        type="button"
                        disabled={busyId === line.productId}
                        className="ds-icon-btn ds-icon-btn--qty"
                        onClick={() => updateQty(line.productId, line.quantity - 1)}
                        aria-label={t("decrease")}
                      >
                        −
                      </button>
                      <input
                        className="ds-qty-input"
                        inputMode="numeric"
                        type="text"
                        pattern="\\d*"
                        disabled={busyId === line.productId}
                        value={qtyDraft[line.productId] ?? String(line.quantity)}
                        onChange={(e) => setQtyDraft((p) => ({ ...p, [line.productId]: e.target.value }))}
                        onBlur={() => void commitQty(line.productId)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            (e.currentTarget as HTMLInputElement).blur();
                          }
                        }}
                        aria-label={t("quantity")}
                      />
                      <button
                        type="button"
                        disabled={busyId === line.productId}
                        className="ds-icon-btn ds-icon-btn--qty"
                        onClick={() => updateQty(line.productId, line.quantity + 1)}
                        aria-label={t("increase")}
                      >
                        +
                      </button>
                    </div>
                    <Button
                      variant="danger"
                      disabled={busyId === line.productId}
                      className="ds-push-end"
                      onClick={() => removeItem(line.productId)}
                    >
                      {t("remove")}
                    </Button>
                  </div>
                  <p className="ds-text-small">
                    <strong>{t("lineTotal")}:</strong> {line.lineTotal}
                  </p>
                </Card>
              ))}
            </ul>
            <div className="ds-totals-strip ds-totals-strip--strong">
              <span>{t("total")}:</span>
              <strong>{cart.cartTotal}</strong>
            </div>
            <div className="ds-actions-row ds-actions-row--summary">
              <Button
                variant="primary"
                block
                disabled={placeOrderBusy || clearBusy}
                className="ds-cart-cta-main"
                onClick={placeOrder}
              >
                {placeOrderBusy ? tOrders("placingOrder") : tOrders("placeOrder")}
              </Button>
              <Button
                variant="secondary"
                block
                disabled={clearBusy || placeOrderBusy}
                onClick={clearAll}
              >
                {t("clearCart")}
              </Button>
            </div>
          </>
        ) : null}
      </main>
    );
  }
