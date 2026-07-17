"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { useAccountStatus } from "@/components/account-status/account-status-provider";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { formatMoney } from "@/components/orders/order-view";
import { typography } from "@/design/typography";

const NOTES_MAX = 500;
const FREE_DELIVERY_THRESHOLD = 500;

type CartLineItem = {
  productId: string;
  quantity: number;
  lineTotal: number;
  product: { name: string; sku: string; price: number; unit: string; imageUrl: string };
  priceBreakdown?: { base: number; final: number };
};

type CartData = {
  items: CartLineItem[];
  cartTotal: number;
  promotions?: {
    gifts: Array<{ productId: string; name: string; imageUrl: string; qty: number; promotionId: string }>;
    orderDiscount?: { amountOff: number };
    totalAfterDiscount?: number;
  };
};

/**
 * Pre-order review — the final checkpoint before the irreversible order.
 * Read-only summary of the priced cart (items, promotions, totals) plus an
 * optional delivery-notes field; the ONLY submission button lives here.
 */
export default function CheckoutReviewPage() {
  const t = useTranslations("checkout");
  const tCart = useTranslations("cart");
  const tOrders = useTranslations("orders");
  const tRestricted = useTranslations("restricted");
  const { restricted, notifyRestricted } = useAccountStatus();
  const locale = useLocale();
  const router = useRouter();

  const [cart, setCart] = useState<CartData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submittedRef = useRef(false); // hard duplicate-submit guard

  const [cardEnabled, setCardEnabled] = useState(false);
  const [agentName, setAgentName] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"card" | "agent">("agent");
  // Card mock step: when PAYMENTS_ENABLED with the dev mock, the order is created
  // pending and we simulate the provider's signed webhook before confirming.
  const [mockOrderId, setMockOrderId] = useState<string | null>(null);
  const [mockPaying, setMockPaying] = useState(false);

  const load = useCallback(async () => {
    try {
      const [cartRes, optRes] = await Promise.all([fetch("/api/cart"), fetch("/api/payments/options")]);
      const json = (await cartRes.json()) as { success?: boolean; data?: CartData; message?: string };
      if (cartRes.status === 200 && json.success && json.data) {
        setCart(json.data);
      } else {
        setError(json.message ?? tCart("error"));
      }
      try {
        const opt = (await optRes.json()) as { success?: boolean; data?: { cardEnabled?: boolean; agentName?: string | null } };
        if (opt.success && opt.data) {
          setCardEnabled(Boolean(opt.data.cardEnabled));
          setAgentName(opt.data.agentName ?? null);
        }
      } catch {
        // options are non-critical — agent payment stays available
      }
    } catch {
      setError(tCart("error"));
    } finally {
      setLoading(false);
    }
  }, [tCart]);

  useEffect(() => {
    void load();
  }, [load]);

  async function confirmOrder() {
    if (submitting || submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    setError("");
    try {
      const method = paymentMethod === "card" && cardEnabled ? "card" : "agent";
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: notes.trim(), paymentMethod: method }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        data?: { id: string };
        clientToken?: string;
        message?: string;
        code?: string;
      };
      if (res.status === 200 && json.success && json.data?.id) {
        // Card: the order is created pending; complete payment (mock) before the
        // confirmation page. Agent: the order is placed as a collection.
        if (method === "card" && json.clientToken) {
          setMockOrderId(json.data.id);
          submittedRef.current = false;
          setSubmitting(false);
          return;
        }
        router.push(`/${locale}/dashboard/orders/confirmation/${json.data.id}`);
        return;
      }
      submittedRef.current = false;
      if (res.status === 403 && json.code === "ACCOUNT_RESTRICTED") {
        notifyRestricted();
        setError(tRestricted("actionBlocked"));
      } else {
        setError(json.message ?? tOrders("error"));
      }
      setSubmitting(false);
    } catch {
      submittedRef.current = false;
      setError(tOrders("error"));
      setSubmitting(false);
    }
  }

  // DEV mock: simulate the provider's signed webhook, then go to confirmation.
  async function completeMockPayment(outcome: "paid" | "failed") {
    if (!mockOrderId || mockPaying) return;
    setMockPaying(true);
    setError("");
    try {
      const res = await fetch("/api/payments/mock/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: mockOrderId, outcome }),
      });
      if (res.status === 200) {
        router.push(`/${locale}/dashboard/orders/confirmation/${mockOrderId}`);
        return;
      }
      setError(tOrders("error"));
    } catch {
      setError(tOrders("error"));
    } finally {
      setMockPaying(false);
    }
  }

  const items = cart?.items ?? [];
  const gifts = cart?.promotions?.gifts ?? [];
  const subtotal = cart?.cartTotal ?? 0;
  const discount = cart?.promotions?.orderDiscount?.amountOff ?? 0;
  const finalTotal = cart?.promotions?.totalAfterDiscount ?? subtotal;
  const freeDelivery = subtotal >= FREE_DELIVERY_THRESHOLD;

  return (
    <main className="ds-page ds-checkout">
      <div className="ds-header-row">
        <div>
          <h1 className={`ds-page-title ${typography.h2}`}>{t("title")}</h1>
          <p className={`ds-page-subtitle ${typography.body}`}>{t("subtitle")}</p>
        </div>
        <div className="ds-header-actions">
          <Link href={`/${locale}/dashboard/cart`} className="ds-link">
            ← {t("backToCart")}
          </Link>
        </div>
      </div>

      {loading ? (
        <ul className="ds-skeleton-list" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <li key={i} className="ds-skeleton-card">
              <span className="ds-skeleton ds-skeleton-line ds-skeleton-line--title" />
              <span className="ds-skeleton ds-skeleton-line ds-skeleton-line--sm" />
            </li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <p className="ds-error" role="alert">
          {error}
        </p>
      ) : null}

      {!loading && cart && items.length === 0 ? (
        <div className="ds-empty-state">
          <p className="ds-empty-state__text">{t("empty")}</p>
          <Link href={`/${locale}/dashboard/products`} className="ds-empty-state__cta">
            <Button variant="primary">{tCart("emptyCta")}</Button>
          </Link>
        </div>
      ) : null}

      {!loading && cart && items.length > 0 ? (
        <>
          <section aria-labelledby="review-items-heading">
            <h2 id="review-items-heading" className="ds-section-title">
              {tOrders("items")}
            </h2>
            <ul className="ds-list">
              {items.map((line) => {
                const discounted = line.priceBreakdown && line.priceBreakdown.final < line.priceBreakdown.base;
                return (
                  <Card as="li" key={line.productId} className="ds-checkout-line">
                    <div className="ds-thumb" aria-hidden="true">
                      {line.product.imageUrl ? (
                        <Image src={line.product.imageUrl} alt="" width={56} height={56} referrerPolicy="no-referrer" />
                      ) : null}
                    </div>
                    <div className="ds-checkout-line__body">
                      <p className="ds-product-name">{line.product.name}</p>
                      <p className="ds-text-caption">
                        {tCart("sku")}: {line.product.sku} · ×{line.quantity}
                      </p>
                      <p className="ds-text-small">
                        {discounted ? (
                          <s className="ds-checkout-line__base" aria-hidden="true">
                            {formatMoney(locale, line.priceBreakdown!.base)}
                          </s>
                        ) : null}{" "}
                        {formatMoney(locale, line.product.price)} / {line.product.unit || "—"}
                      </p>
                    </div>
                    <strong className="ds-checkout-line__total">{formatMoney(locale, line.lineTotal)}</strong>
                  </Card>
                );
              })}

              {gifts.map((gift) => (
                <Card as="li" key={`gift-${gift.promotionId}-${gift.productId}`} className="ds-checkout-line ds-gift-row">
                  <div className="ds-thumb" aria-hidden="true">
                    {gift.imageUrl ? (
                      <Image src={gift.imageUrl} alt="" width={56} height={56} referrerPolicy="no-referrer" />
                    ) : (
                      <span className="ds-gift-row__emoji">🎁</span>
                    )}
                  </div>
                  <div className="ds-checkout-line__body">
                    <p className="ds-product-name">
                      <span className="ds-gift-badge">{tCart("giftLine")} 🎁</span> {gift.name}
                    </p>
                    <p className="ds-text-caption">×{gift.qty}</p>
                  </div>
                  <strong className="ds-checkout-line__total">₪0</strong>
                </Card>
              ))}
            </ul>
          </section>

          <section aria-labelledby="review-notes-heading" className="ds-mt-sm">
            <h2 id="review-notes-heading" className="ds-section-title">
              {t("notesLabel")}
            </h2>
            <textarea
              className="ds-checkout-notes"
              dir="auto"
              rows={3}
              maxLength={NOTES_MAX}
              value={notes}
              placeholder={t("notesPlaceholder")}
              onChange={(e) => setNotes(e.target.value)}
              aria-label={t("notesLabel")}
            />
            <p className="ds-text-caption" aria-hidden="true">
              {notes.length}/{NOTES_MAX}
            </p>
          </section>

          <section aria-labelledby="review-payment-heading" className="ds-mt-sm">
            <h2 id="review-payment-heading" className="ds-section-title">
              {t("paymentTitle")}
            </h2>
            <div className="ds-pay-options" role="radiogroup" aria-label={t("paymentTitle")}>
              <label className={`ds-pay-option${paymentMethod === "agent" ? " ds-pay-option--active" : ""}`}>
                <input
                  type="radio"
                  name="paymentMethod"
                  value="agent"
                  checked={paymentMethod === "agent"}
                  onChange={() => setPaymentMethod("agent")}
                />
                <span className="ds-pay-option__body">
                  <span className="ds-pay-option__title">
                    {agentName ? t("payViaAgentNamed", { name: agentName }) : t("payViaAgent")}
                  </span>
                  <span className="ds-pay-option__sub">{t("payViaAgentHint")}</span>
                </span>
              </label>

              {cardEnabled ? (
                <label className={`ds-pay-option${paymentMethod === "card" ? " ds-pay-option--active" : ""}`}>
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="card"
                    checked={paymentMethod === "card"}
                    onChange={() => setPaymentMethod("card")}
                  />
                  <span className="ds-pay-option__body">
                    <span className="ds-pay-option__title">💳 {t("payCard")}</span>
                    <span className="ds-pay-option__sub">{t("payCardHint")}</span>
                  </span>
                </label>
              ) : null}
            </div>
          </section>

          {mockOrderId ? (
            <section className="ds-card ds-stack ds-stack--tight ds-mt-sm" aria-label={t("mockPayTitle")}>
              <h2 className="ds-section-title ds-m-0">{t("mockPayTitle")}</h2>
              <p className="ds-text-small">{t("mockPayHint")}</p>
              <div className="ds-actions-row">
                <Button variant="primary" block disabled={mockPaying} onClick={() => void completeMockPayment("paid")}>
                  {mockPaying ? t("confirming") : t("mockPaySuccess")}
                </Button>
                <Button variant="secondary" block disabled={mockPaying} onClick={() => void completeMockPayment("failed")}>
                  {t("mockPayFail")}
                </Button>
              </div>
            </section>
          ) : null}

          <section className="ds-checkout-summary" aria-labelledby="review-total-heading">
            <h2 id="review-total-heading" className="ds-visually-hidden">
              {tOrders("total")}
            </h2>
            <div className="ds-totals-strip">
              <span>{tOrders("subtotal")}:</span>
              <strong>{formatMoney(locale, subtotal)}</strong>
            </div>
            {discount > 0 ? (
              <div className="ds-totals-strip">
                <span>{tCart("promoDiscount")}:</span>
                <strong>-{formatMoney(locale, discount)}</strong>
              </div>
            ) : null}
            <div className="ds-totals-strip">
              <span>{t("delivery")}:</span>
              <strong>{freeDelivery ? t("freeDelivery") : t("deliveryStandard")}</strong>
            </div>
            <div className="ds-totals-strip ds-totals-strip--strong">
              <span>{tOrders("total")}:</span>
              <strong>{formatMoney(locale, finalTotal)}</strong>
            </div>

            <Button
              variant="primary"
              block
              className="ds-checkout-confirm"
              disabled={submitting || restricted}
              title={restricted ? tRestricted("actionBlocked") : undefined}
              onClick={() => void confirmOrder()}
            >
              {submitting ? t("confirming") : t("confirm")}
            </Button>
          </section>
        </>
      ) : null}
    </main>
  );
}
