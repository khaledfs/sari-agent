"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/Button";
import {
  OrderItemsList,
  OrderReceipt,
  OrderTotals,
  shortOrderNumber,
  type OrderViewData,
} from "@/components/orders/order-view";
import { useRealtimeEvent } from "@/components/realtime/realtime-provider";
import { isReceiptAvailable } from "@/lib/order-status";
import { OrderTimeline } from "../../OrderTimeline";

/**
 * Post-purchase confirmation. Loads the order from the API by id (nothing
 * depends on transient client state), so it survives refresh and can be
 * bookmarked/shared with anyone logged into the same account.
 */
export default function OrderConfirmationPage() {
  const t = useTranslations("orders");
  const locale = useLocale();
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";

  const [order, setOrder] = useState<OrderViewData | null>(null);
  const [customer, setCustomer] = useState<{ businessName: string; phoneNumber: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [receiptError, setReceiptError] = useState("");
  const [printing, setPrinting] = useState(false);

  const load = useCallback(async () => {
    if (!id) {
      setError(t("error"));
      setLoading(false);
      return;
    }
    try {
      const [orderRes, accountRes] = await Promise.all([fetch(`/api/orders/${id}`), fetch("/api/account")]);
      const orderJson = (await orderRes.json()) as { success?: boolean; data?: OrderViewData; message?: string };
      if (orderRes.status === 200 && orderJson.success && orderJson.data) {
        setOrder(orderJson.data);
      } else {
        setError(orderJson.message ?? t("error"));
      }
      try {
        const accountJson = (await accountRes.json()) as {
          success?: boolean;
          data?: { profile?: { businessName?: string; phoneNumber?: string } };
        };
        if (accountJson.success && accountJson.data?.profile?.businessName) {
          setCustomer({
            businessName: accountJson.data.profile.businessName,
            phoneNumber: accountJson.data.profile.phoneNumber ?? "",
          });
        }
      } catch {
        // receipt just omits the customer block
      }
    } catch {
      setError(t("error"));
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  useEffect(() => {
    void load();
  }, [load]);

  // Live unlock: the receipt becomes printable the moment the admin dispatches.
  useRealtimeEvent(["order.status_changed"], (event) => {
    if (event.type !== "order.status_changed" || event.orderId !== id) return;
    setOrder((current) => (current ? { ...current, status: event.status } : current));
    setReceiptError("");
  });

  async function printReceipt() {
    if (printing) return;
    setPrinting(true);
    setReceiptError("");
    try {
      const res = await fetch(`/api/orders/${id}/receipt`);
      const json = (await res.json()) as { success?: boolean; code?: string; message?: string };
      if (res.status === 200 && json.success) {
        window.print();
        return;
      }
      if (res.status === 403 && json.code === "RECEIPT_NOT_AVAILABLE") {
        setReceiptError(t("receiptLockedTooltip"));
        void load();
        return;
      }
      setReceiptError(json.message ?? t("error"));
    } catch {
      setReceiptError(t("error"));
    } finally {
      setPrinting(false);
    }
  }

  function formatDate(iso: string) {
    try {
      return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
    } catch {
      return iso;
    }
  }

  return (
    <main className="ds-page">
      {loading ? (
        <div className="ds-skeleton-card" aria-hidden="true">
          <span className="ds-skeleton ds-skeleton-line ds-skeleton-line--title" />
          <span className="ds-skeleton ds-skeleton-line ds-skeleton-line--wide" />
          <span className="ds-skeleton ds-skeleton-block" />
        </div>
      ) : null}
      {error ? (
        <p className="ds-error" role="alert">
          {error}
        </p>
      ) : null}

      {!loading && order ? (
        <>
          <section className="ds-confirmation-hero" role="status">
            <span className="ds-confirmation-hero__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </span>
            <h1 className="ds-confirmation-hero__title">{t("confirmedTitle")}</h1>
            <p className="ds-confirmation-hero__body">{t("confirmedBody")}</p>
            <p className="ds-confirmation-hero__meta">
              {t("orderNumber")}: <strong dir="ltr">{shortOrderNumber(order.id)}</strong>
              {" · "}
              {formatDate(order.createdAt)}
            </p>
          </section>

          <div className="ds-card ds-stack ds-stack--tight">
            <h2 className="ds-section-title ds-m-0">{t("trackingTitle")}</h2>
            <OrderTimeline status={order.status} />
          </div>

          <h2 className="ds-section-title">{t("items")}</h2>
          <div className="ds-card">
            <OrderItemsList items={order.items} locale={locale} t={t} />
          </div>

          <OrderTotals
            items={order.items}
            total={order.total}
            promotionDiscount={order.promotionDiscount}
            locale={locale}
            t={t}
          />

          {order.notes ? (
            <div className="ds-card ds-stack ds-stack--tight">
              <h2 className="ds-section-title ds-m-0">{t("notesTitle")}</h2>
              <p className="ds-text-small">{order.notes}</p>
            </div>
          ) : null}

          <div className="ds-actions-row ds-actions-row--summary">
            <Link href={`/${locale}/dashboard/products`} className="ds-flex-1">
              <Button variant="primary" block>
                {t("continueShopping")}
              </Button>
            </Link>
            <Link href={`/${locale}/dashboard/orders`} className="ds-flex-1">
              <Button variant="secondary" block>
                {t("viewOrders")}
              </Button>
            </Link>
            <Button
              variant="secondary"
              block
              disabled={!isReceiptAvailable(order.status) || printing}
              title={!isReceiptAvailable(order.status) ? t("receiptLockedTooltip") : undefined}
              onClick={() => void printReceipt()}
            >
              {t("printReceipt")}
            </Button>
          </div>
          {!isReceiptAvailable(order.status) ? (
            <p className="ds-text-caption" role="note">
              🔒 {t("receiptLockedTooltip")}
            </p>
          ) : null}
          {receiptError ? (
            <p className="ds-error" role="alert">
              {receiptError}
            </p>
          ) : null}

          {isReceiptAvailable(order.status) ? (
            <OrderReceipt order={order} customer={customer} locale={locale} t={t} />
          ) : null}
        </>
      ) : null}
    </main>
  );
}
