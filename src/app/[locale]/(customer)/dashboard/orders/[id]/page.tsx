"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import {
  OrderItemsList,
  OrderReceipt,
  OrderTotals,
  shortOrderNumber,
  type OrderViewData,
} from "@/components/orders/order-view";
import { useRealtimeEvent } from "@/components/realtime/realtime-provider";
import { isReceiptAvailable } from "@/lib/order-status";
import { OrderTimeline } from "../OrderTimeline";

type OrderDetail = OrderViewData & { userId: string };

function orderStatusBadgeClass(status: string) {
  const s = status.toLowerCase();
  if (s === "pending") return "ds-badge ds-badge--unpaid";
  return "ds-badge ds-badge--neutral";
}

export default function OrderDetailPage() {
  const t = useTranslations("orders");
  const tSmart = useTranslations("smartOrdering");
  const tCart = useTranslations("cart");
  const locale = useLocale();
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [customer, setCustomer] = useState<{ businessName: string; phoneNumber: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reordering, setReordering] = useState(false);
  const [reorderBanner, setReorderBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [receiptError, setReceiptError] = useState("");
  const [printing, setPrinting] = useState(false);

  const load = useCallback(async () => {
    if (!id) {
      setError(t("error"));
      setLoading(false);
      return;
    }
    setError("");
    try {
      const res = await fetch(`/api/orders/${id}`, { method: "GET" });
      const json = (await res.json()) as {
        success?: boolean;
        data?: OrderDetail;
        message?: string;
      };
      if (res.status === 401) {
        setError(t("error"));
        setOrder(null);
        return;
      }
      if (res.status === 404) {
        setError(json.message ?? t("error"));
        setOrder(null);
        return;
      }
      if (res.status === 200 && json.success && json.data) {
        setOrder(json.data);
        // Customer info for the printable receipt (fail-soft).
        try {
          const accountRes = await fetch("/api/account");
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
          // receipt omits the customer block
        }
        return;
      }
      setError(json.message ?? t("error"));
    } catch {
      setError(t("error"));
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  useEffect(() => {
    void load();
  }, [load]);

  // Live: the admin advancing this order's status moves the timeline (and,
  // once dispatched, unlocks the receipt) without a refresh.
  useRealtimeEvent(["order.status_changed"], (event) => {
    if (event.type !== "order.status_changed" || event.orderId !== id) return;
    setOrder((current) => (current ? { ...current, status: event.status } : current));
    setReceiptError("");
  });

  /**
   * Server-verified print (Work Order Issue 1): the receipt endpoint re-checks
   * the CURRENT status server-side, so a stale-looking-unlocked button gets a
   * graceful 403 message instead of printing a receipt it shouldn't.
   */
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
        // Stale local state — pull the authoritative status back.
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

  async function reorder() {
    if (!id) return;
    setReordering(true);
    setReorderBanner(null);
    try {
      const res = await fetch(`/api/orders/${id}/reorder`, { method: "POST" });
      const json = (await res.json()) as {
        success?: boolean;
        message?: string;
        data?: { added: number; skipped: number };
      };
      if (res.status === 401) {
        setReorderBanner({ kind: "err", text: t("error") });
        return;
      }
      if (res.status === 200 && json.success && json.data) {
        setReorderBanner({
          kind: "ok",
          text: tSmart("reorderSuccess", { added: json.data.added, skipped: json.data.skipped }),
        });
        return;
      }
      setReorderBanner({ kind: "err", text: json.message ?? tSmart("reorderError") });
    } catch {
      setReorderBanner({ kind: "err", text: tSmart("reorderError") });
    } finally {
      setReordering(false);
    }
  }

  function formatDate(iso: string) {
    try {
      return new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  }

  return (
    <main className="ds-page">
      <div className="ds-profile-section">
        <Link href={`/${locale}/dashboard/orders`} className="ds-link">
          ← {t("backToList")}
        </Link>
      </div>

      {loading ? (
        <div className="ds-stack ds-content-after-title" aria-hidden="true">
          <div className="ds-skeleton-card">
            <span className="ds-skeleton ds-skeleton-line ds-skeleton-line--title" />
            <span className="ds-skeleton ds-skeleton-line ds-skeleton-line--wide" />
            <span className="ds-skeleton ds-skeleton-block" />
          </div>
          <div className="ds-skeleton-card">
            <span className="ds-skeleton ds-skeleton-line ds-skeleton-line--sm" />
            <span className="ds-skeleton ds-skeleton-line" />
            <span className="ds-skeleton ds-skeleton-line ds-skeleton-line--wide" />
          </div>
        </div>
      ) : null}
      {error ? <p className="ds-error ds-mt-sm">{error}</p> : null}
      {reorderBanner ? (
        <p
          className={reorderBanner.kind === "ok" ? "ds-success-text ds-mt-sm" : "ds-error ds-mt-sm"}
          role="status"
        >
          {reorderBanner.text}
          {reorderBanner.kind === "ok" ? (
            <>
              {" "}
              <Link href={`/${locale}/dashboard/cart`} className="ds-link">
                {tCart("goToCart")}
              </Link>
            </>
          ) : null}
        </p>
      ) : null}

      {!loading && order ? (
        <div className="ds-stack ds-content-after-title">
          <div className="ds-card ds-stack ds-stack--tight">
            <div className="ds-order-row">
              <h1 className="ds-page-title ds-m-0">{t("details")}</h1>
              <span className={orderStatusBadgeClass(order.status)}>{order.status}</span>
            </div>
            <p className="ds-text-small">
              <strong>{t("orderNumber")}:</strong> <span dir="ltr">{shortOrderNumber(order.id)}</span>
            </p>
            <p className="ds-text-small">
              <strong>{t("createdAt")}:</strong> {formatDate(order.createdAt)}
            </p>
          </div>

          <div className="ds-card ds-stack ds-stack--tight">
            <h2 className="ds-section-title ds-m-0">{t("trackingTitle")}</h2>
            <OrderTimeline status={order.status} />
          </div>

          {order.notes ? (
            <div className="ds-card ds-stack ds-stack--tight">
              <h2 className="ds-section-title ds-m-0">{t("notesTitle")}</h2>
              <p className="ds-text-small">{order.notes}</p>
            </div>
          ) : null}

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

          <div className="ds-actions-row">
            <button
              type="button"
              className="ds-btn ds-btn--secondary ds-btn--block ds-flex-1"
              disabled={reordering}
              onClick={() => void reorder()}
            >
              {reordering ? tSmart("reordering") : tSmart("reorder")}
            </button>
            <button
              type="button"
              className="ds-btn ds-btn--secondary ds-btn--block ds-flex-1"
              disabled={!isReceiptAvailable(order.status) || printing}
              title={!isReceiptAvailable(order.status) ? t("receiptLockedTooltip") : undefined}
              onClick={() => void printReceipt()}
            >
              {t("printReceipt")}
            </button>
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

          {/* The hidden print block only exists in the DOM once the rule passes —
              a manual Ctrl+P before dispatch prints nothing. */}
          {isReceiptAvailable(order.status) ? (
            <OrderReceipt order={order} customer={customer} locale={locale} t={t} />
          ) : null}
        </div>
      ) : null}
    </main>
  );
}
