  "use client";

  import Image from "next/image";
  import Link from "next/link";
  import { useCallback, useEffect, useState } from "react";
  import { useLocale, useTranslations } from "next-intl";

  import { useAccountStatus } from "@/components/account-status/account-status-provider";
  import { useRealtimeRefetch } from "@/components/realtime/realtime-provider";
  import { Button } from "@/components/ui/Button";
  import { Card } from "@/components/ui/Card";
  import { typography } from "@/design/typography";

  /**
   * Order subtotal (₪) that unlocks free delivery. Change this one number
   * to move the threshold; the progress bar and copy follow automatically.
   */
  const FREE_DELIVERY_THRESHOLD = 500;

  const TruckIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="3" width="15" height="13" />
      <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
      <circle cx="5.5" cy="18.5" r="2.5" />
      <circle cx="18.5" cy="18.5" r="2.5" />
    </svg>
  );

  const CartEmptyIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
  );

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
      /** Availability (Issue 4 realtime): false / 0 stock = unavailable line. */
      isActive?: boolean;
      stock?: number | null;
    };
  };

  /** A line the customer can no longer buy: product deactivated or sold out. */
  function isLineUnavailable(line: CartLineItem): boolean {
    return line.product.isActive === false || line.product.stock === 0;
  }

  type CartPromotions = {
    gifts: Array<{
      productId: string;
      name: string;
      imageUrl: string;
      qty: number;
      promotionId: string;
    }>;
    orderDiscount?: { promotionId: string; discountType: string; value: number; amountOff: number };
    totalAfterDiscount?: number;
    nearestHint?: { promotionId: string; kind: string; label: string; remaining: number };
  };

  type CartData = {
    cartId: string;
    userId: string;
    items: CartLineItem[];
    cartTotal: number;
    promotions?: CartPromotions;
  };

  export default function CartPage() {
    const t = useTranslations("cart");
    const tOrders = useTranslations("orders");
    const tNav = useTranslations("dashboard.nav");
    const tRestricted = useTranslations("restricted");
    const { restricted, notifyRestricted } = useAccountStatus();
    const locale = useLocale();
    const [cart, setCart] = useState<CartData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [busyId, setBusyId] = useState<string | null>(null);
    const [clearBusy, setClearBusy] = useState(false);
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

    // Live: catalog changes (price/stock/active) silently refresh the cart so
    // unavailable lines surface an inline notice. The cart contents are NEVER
    // mutated behind the user's back — only the notice appears.
    useRealtimeRefetch(["product.updated", "inventory.updated"], loadCart);

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
        const json = (await res.json()) as { success?: boolean; data?: CartData; message?: string; code?: string };
        if (res.status === 401) {
          setError(t("error"));
          return;
        }
        if (res.status === 403 && json.code === "ACCOUNT_RESTRICTED") {
          notifyRestricted();
          setError(tRestricted("actionBlocked"));
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
        const json = (await res.json()) as { success?: boolean; data?: CartData; message?: string; code?: string };
        if (res.status === 401) {
          setError(t("error"));
          return;
        }
        if (res.status === 403 && json.code === "ACCOUNT_RESTRICTED") {
          notifyRestricted();
          setError(tRestricted("actionBlocked"));
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

    async function clearAll() {
      setClearBusy(true);
      setError("");
      try {
        const res = await fetch("/api/cart/clear", { method: "POST" });
        const json = (await res.json()) as { success?: boolean; data?: CartData; message?: string; code?: string };
        if (res.status === 401) {
          setError(t("error"));
          return;
        }
        if (res.status === 403 && json.code === "ACCOUNT_RESTRICTED") {
          notifyRestricted();
          setError(tRestricted("actionBlocked"));
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

    // Free-delivery progress, derived from the live cart subtotal. Fail soft:
    // a null/empty cart just reads as 0 (bar hidden until there are items).
    const cartTotal = cart?.cartTotal ?? 0;
    const itemCount = (cart?.items ?? []).reduce((n, l) => n + (Number.isFinite(l.quantity) ? l.quantity : 0), 0);
    const freeDeliveryMet = cartTotal >= FREE_DELIVERY_THRESHOLD;
    const remaining = Math.max(0, Math.ceil(FREE_DELIVERY_THRESHOLD - cartTotal));
    const progressPct = FREE_DELIVERY_THRESHOLD > 0
      ? Math.min(100, Math.max(0, (cartTotal / FREE_DELIVERY_THRESHOLD) * 100))
      : 0;

    return (
      <main className="ds-page ds-page--ambient-band">
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

        {loading ? (
          <ul className="ds-skeleton-list" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <li key={i} className="ds-skeleton-card">
                <span className="ds-skeleton ds-skeleton-line ds-skeleton-line--title" />
                <span className="ds-skeleton ds-skeleton-line ds-skeleton-line--sm" />
                <span className="ds-skeleton ds-skeleton-block" />
              </li>
            ))}
          </ul>
        ) : null}
        {error ? <p className="ds-error">{error}</p> : null}

        {!loading && cart && cart.items.length === 0 ? (
          <div className="ds-empty-state">
            <span className="ds-empty-state__icon" aria-hidden="true">
              <CartEmptyIcon />
            </span>
            <p className="ds-empty-state__text">{t("empty")}</p>
            <Link href={`/${locale}/dashboard/products`} className="ds-empty-state__cta">
              <Button variant="primary">{t("emptyCta")}</Button>
            </Link>
          </div>
        ) : null}

        {!loading && cart && cart.items.length > 0 ? (
          <>
            <div
              className={`ds-cart-progress${freeDeliveryMet ? " ds-cart-progress--met" : ""}`}
              role="status"
            >
              <div className="ds-cart-progress__head">
                <p className="ds-cart-progress__msg">
                  <span className="ds-cart-progress__icon" aria-hidden="true">
                    <TruckIcon />
                  </span>
                  {freeDeliveryMet ? (
                    <span>{t("freeDeliveryMet")}</span>
                  ) : (
                    <span>{t.rich("freeDeliveryRemaining", {
                      amount: remaining,
                      strong: (chunks) => <strong>{chunks}</strong>,
                    })}</span>
                  )}
                </p>
                <span className="ds-cart-progress__count">
                  <span className="ds-cart-progress__count-num" key={itemCount}>
                    {itemCount}
                  </span>
                  {t("itemsUnit")}
                </span>
              </div>
              <div className="ds-cart-progress__track" aria-hidden="true">
                <span className="ds-cart-progress__fill" style={{ inlineSize: `${progressPct}%` }} />
              </div>
            </div>

            {cart.promotions?.nearestHint ? (
              <div className="ds-cart-progress ds-promo-hint" role="status">
                <p className="ds-cart-progress__msg">
                  <span aria-hidden="true">🎁</span>{" "}
                  {t.rich("promoHintRemaining", {
                    amount: cart.promotions.nearestHint.remaining,
                    strong: (chunks) => <strong>{chunks}</strong>,
                  })}
                  {cart.promotions.nearestHint.label ? ` — ${cart.promotions.nearestHint.label}` : null}
                </p>
              </div>
            ) : null}

            <ul className="ds-list">
              {cart.items.map((line) => (
                <Card as="li" key={line.productId} className="ds-stack ds-stack--tight ds-cart-row-card">
                  <div className="ds-product-row">
                    <div className="ds-thumb" aria-hidden="true">
                      {line.product.imageUrl ? (
                        <Image
                          src={line.product.imageUrl}
                          alt=""
                          width={56}
                          height={56}
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
                        disabled={busyId === line.productId || restricted}
                        title={restricted ? tRestricted("actionBlocked") : undefined}
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
                        disabled={busyId === line.productId || restricted}
                        title={restricted ? tRestricted("actionBlocked") : undefined}
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
                        disabled={busyId === line.productId || restricted}
                        title={restricted ? tRestricted("actionBlocked") : undefined}
                        className="ds-icon-btn ds-icon-btn--qty"
                        onClick={() => updateQty(line.productId, line.quantity + 1)}
                        aria-label={t("increase")}
                      >
                        +
                      </button>
                    </div>
                    <Button
                      variant="danger"
                      disabled={busyId === line.productId || restricted}
                      title={restricted ? tRestricted("actionBlocked") : undefined}
                      className="ds-push-end"
                      onClick={() => removeItem(line.productId)}
                    >
                      {t("remove")}
                    </Button>
                  </div>
                  <p className="ds-text-small">
                    <strong>{t("lineTotal")}:</strong> {line.lineTotal}
                  </p>
                  {isLineUnavailable(line) ? (
                    <p className="ds-error" role="alert" style={{ marginBlockStart: "0.25rem" }}>
                      ⚠️ {t("unavailableLine")}
                    </p>
                  ) : null}
                </Card>
              ))}

              {(cart.promotions?.gifts ?? []).map((gift) => (
                <Card as="li" key={`gift-${gift.promotionId}-${gift.productId}`} className="ds-stack ds-stack--tight ds-cart-row-card ds-gift-row">
                  <div className="ds-product-row">
                    <div className="ds-thumb" aria-hidden="true">
                      {gift.imageUrl ? (
                        <Image src={gift.imageUrl} alt="" width={56} height={56} referrerPolicy="no-referrer" />
                      ) : (
                        <span className="ds-gift-row__emoji">🎁</span>
                      )}
                    </div>
                    <div className="ds-stack ds-stack--tight" style={{ minWidth: 0 }}>
                      <p className="ds-product-name">
                        <span className="ds-gift-badge">{t("giftLine")} 🎁</span> {gift.name}
                      </p>
                      <p className="ds-text-small">
                        <strong>{t("quantity")}:</strong> {gift.qty} · <strong>{t("unitPrice")}:</strong> ₪0
                      </p>
                    </div>
                  </div>
                </Card>
              ))}
            </ul>
            {cart.promotions?.orderDiscount ? (
              <div className="ds-totals-strip">
                <span>{t("promoDiscount")}:</span>
                <strong>-₪{cart.promotions.orderDiscount.amountOff}</strong>
              </div>
            ) : null}
            <div className="ds-totals-strip ds-totals-strip--strong">
              <span>{t("total")}:</span>
              <strong>{cart.promotions?.totalAfterDiscount ?? cart.cartTotal}</strong>
            </div>
            {cart.items.some(isLineUnavailable) ? (
              <p className="ds-error" role="alert">
                {t("unavailableCheckout")}
              </p>
            ) : null}
            <div className="ds-actions-row ds-actions-row--summary">
              {/* Ordering is no longer direct — the review page is the only place
                  with a Confirm Order button. */}
              {restricted || cart.items.some(isLineUnavailable) ? (
                <span className="ds-cart-cta-main ds-flex-1">
                  <Button
                    variant="primary"
                    block
                    disabled
                    title={restricted ? tRestricted("actionBlocked") : t("unavailableCheckout")}
                  >
                    {tOrders("goToReview")}
                  </Button>
                </span>
              ) : (
                <Link href={`/${locale}/dashboard/checkout`} className="ds-cart-cta-main ds-flex-1">
                  <Button variant="primary" block disabled={clearBusy}>
                    {tOrders("goToReview")}
                  </Button>
                </Link>
              )}
              <Button
                variant="secondary"
                block
                disabled={clearBusy || restricted}
                title={restricted ? tRestricted("actionBlocked") : undefined}
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
