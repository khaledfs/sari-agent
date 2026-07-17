"use client";

import type { useTranslations } from "next-intl";

import { suppliedQty } from "@/lib/order-adjustment";

type T = ReturnType<typeof useTranslations>;

export type OrderViewItem = {
  productId: string;
  name: string;
  price: number;
  /** Ordered quantity (immutable evidence). */
  quantity: number;
  /** Actually-supplied quantity; absent ⇒ equals ordered. */
  suppliedQuantity?: number;
  /** Note when this line was short-supplied. */
  adjustmentNote?: string;
  lineTotal: number;
  isGift?: boolean;
  priceBreakdown?: { base: number; final: number };
};

export type OrderViewData = {
  id: string;
  items: OrderViewItem[];
  total: number;
  status: string;
  createdAt: string;
  notes?: string;
  promotionDiscount?: { amountOff: number };
  adjusted?: boolean;
  adjustedAt?: string;
  adjustmentSeenAt?: string;
  paymentMethod?: "card" | "agent";
  paymentStatus?: string;
  paidAt?: string;
};

/** True when a line's supplied quantity differs from what was ordered. */
export function lineIsAdjusted(item: OrderViewItem): boolean {
  return suppliedQty(item) !== item.quantity;
}

/**
 * Payment method + state pill (confirmation + order detail). Never shows card
 * data — only the method and its settlement state.
 */
export function PaymentStateBadge({
  order,
  t,
}: {
  order: { paymentMethod?: "card" | "agent"; paymentStatus?: string };
  t: T;
}) {
  if (!order.paymentMethod) return null;
  const status = order.paymentStatus ?? "";
  const cls =
    status === "paid" ? "ds-pay-state ds-pay-state--paid" : status === "failed" ? "ds-pay-state ds-pay-state--failed" : "ds-pay-state";
  const methodLabel = order.paymentMethod === "card" ? t("payment.methodCard") : t("payment.methodAgent");
  const statusLabel =
    status === "paid"
      ? t("payment.statusPaid")
      : status === "failed"
        ? t("payment.statusFailed")
        : status === "collect_via_agent"
          ? t("payment.statusCollect")
          : t("payment.statusPending");
  return (
    <span className={cls}>
      {order.paymentMethod === "card" ? "💳" : "🤝"} {methodLabel} · {statusLabel}
    </span>
  );
}

export function formatMoney(locale: string, n: number) {
  // Currency is always two decimals (₪8,709.40, never ₪8,709.4). Locale-aware
  // grouping; the value is already in major units rounded to agorot upstream.
  return `₪${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`;
}

export function shortOrderNumber(id: string) {
  return id.slice(-8).toUpperCase();
}

/** Paid-lines subtotal (gifts are ₪0 lines and don't affect it). */
export function orderSubtotal(items: OrderViewItem[]) {
  return Math.round(items.reduce((n, i) => n + i.lineTotal, 0) * 100) / 100;
}

/**
 * Shared line-items list — used by the checkout review, the confirmation
 * page, and the order detail page so pricing is rendered exactly once.
 * Discounted lines show the original (base) price struck through.
 */
export function OrderItemsList({ items, locale, t }: { items: OrderViewItem[]; locale: string; t: T }) {
  return (
    <ul className="ds-order-lines ds-order-lines--view">
      {items.map((item, i) => {
        const discounted =
          !item.isGift && item.priceBreakdown && item.priceBreakdown.final < item.priceBreakdown.base;
        const supplied = suppliedQty(item);
        const adjusted = supplied !== item.quantity;
        return (
          <li key={`${item.productId}-${i}`} className="ds-order-line">
            <span className="ds-order-line__name">
              {item.isGift ? <span className="ds-gift-badge">{t("giftLine")} 🎁</span> : null} {item.name}
              {adjusted ? (
                <span className="ds-order-line__adjust-note">
                  {t("suppliedShort", { ordered: item.quantity, supplied })}
                  {item.adjustmentNote ? ` — ${item.adjustmentNote}` : ""}
                </span>
              ) : null}
            </span>
            <span className="ds-order-line__qty">
              {adjusted ? (
                <>
                  <s className="ds-order-line__qty-ordered" aria-hidden="true">×{item.quantity}</s>{" "}
                  <span className="ds-order-line__qty-supplied">×{supplied}</span>
                </>
              ) : (
                <>×{item.quantity}</>
              )}
            </span>
            <span className="ds-order-line__price">
              {discounted ? (
                <s className="ds-order-line__base" aria-hidden="true">
                  {formatMoney(locale, item.priceBreakdown!.base)}
                </s>
              ) : null}{" "}
              {formatMoney(locale, item.price)}
            </span>
            <span className="ds-order-line__total">{formatMoney(locale, item.lineTotal)}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Shared totals breakdown: subtotal → promotion discount → grand total. */
export function OrderTotals({
  items,
  total,
  promotionDiscount,
  locale,
  t,
}: {
  items: OrderViewItem[];
  total: number;
  promotionDiscount?: { amountOff: number };
  locale: string;
  t: T;
}) {
  const subtotal = orderSubtotal(items);
  const showSubtotal = promotionDiscount?.amountOff ? subtotal !== total : false;
  return (
    <div className="ds-order-totals">
      {showSubtotal ? (
        <div className="ds-totals-strip">
          <span>{t("subtotal")}:</span>
          <strong>{formatMoney(locale, subtotal)}</strong>
        </div>
      ) : null}
      {promotionDiscount?.amountOff ? (
        <div className="ds-totals-strip">
          <span>{t("discount")}:</span>
          <strong>-{formatMoney(locale, promotionDiscount.amountOff)}</strong>
        </div>
      ) : null}
      <div className="ds-totals-strip ds-totals-strip--strong">
        <span>{t("total")}:</span>
        <strong>{formatMoney(locale, total)}</strong>
      </div>
    </div>
  );
}

/**
 * Print-only A4 receipt. Hidden on screen (`.ds-receipt { display:none }`);
 * the print stylesheet in globals.css shows ONLY this block. Triggered via
 * window.print() — no PDF libraries.
 */
export function OrderReceipt({
  order,
  customer,
  locale,
  t,
  standalone = false,
}: {
  order: OrderViewData;
  customer: { businessName: string; phoneNumber: string } | null;
  locale: string;
  t: T;
  /**
   * When embedded in an order page the receipt is print-only and hidden from
   * the a11y tree (aria-hidden). On the dedicated /receipt route it IS the page
   * content, so it must be screen-reader visible.
   */
  standalone?: boolean;
}) {
  const subtotal = orderSubtotal(order.items);
  const date = (() => {
    try {
      return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(
        new Date(order.createdAt)
      );
    } catch {
      return order.createdAt;
    }
  })();

  return (
    <div className="ds-receipt" aria-hidden={standalone ? undefined : true}>
      <header className="ds-receipt__head">
        <div className="ds-receipt__brand">SARI</div>
        <div className="ds-receipt__brand-sub">Sari Ahmad Hassan 2001 Ltd.</div>
        <div className="ds-receipt__meta">
          <span>
            {t("orderNumber")}: <strong dir="ltr">{shortOrderNumber(order.id)}</strong>
          </span>
          <span>
            {t("createdAt")}: {date}
          </span>
        </div>
      </header>

      {customer ? (
        <section className="ds-receipt__customer">
          <strong>{customer.businessName}</strong>
          <span dir="ltr">{customer.phoneNumber}</span>
          {order.notes ? <p className="ds-receipt__notes">📝 {order.notes}</p> : null}
        </section>
      ) : null}

      <table className="ds-receipt__table">
        <thead>
          <tr>
            <th>{t("items")}</th>
            <th>{t("quantity")}</th>
            <th>{t("itemPrice")}</th>
            <th>{t("lineTotal")}</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item, i) => {
            const supplied = suppliedQty(item);
            const adjusted = supplied !== item.quantity;
            return (
              <tr key={`${item.productId}-${i}`}>
                <td>
                  {item.isGift ? "🎁 " : null}
                  {item.name}
                  {adjusted ? (
                    <span className="ds-receipt__line-note">
                      {t("suppliedShort", { ordered: item.quantity, supplied })}
                      {item.adjustmentNote ? ` — ${item.adjustmentNote}` : ""}
                    </span>
                  ) : null}
                </td>
                <td>{supplied}</td>
                <td>{formatMoney(locale, item.price)}</td>
                <td>{formatMoney(locale, item.lineTotal)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <section className="ds-receipt__summary">
        {order.promotionDiscount?.amountOff ? (
          <>
            <div>
              <span>{t("subtotal")}</span>
              <span>{formatMoney(locale, subtotal)}</span>
            </div>
            <div>
              <span>{t("discount")}</span>
              <span>-{formatMoney(locale, order.promotionDiscount.amountOff)}</span>
            </div>
          </>
        ) : null}
        <div className="ds-receipt__grand">
          <span>{t("total")}</span>
          <span>{formatMoney(locale, order.total)}</span>
        </div>
      </section>

      <footer className="ds-receipt__foot">{t("receiptFooter")}</footer>
    </div>
  );
}
