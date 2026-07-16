"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { useRealtimeEvent, useRealtimeRefetch } from "@/components/realtime/realtime-provider";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { StatusBadgeState } from "@/components/ui/StatusBadge";
import { typography } from "@/design/typography";
import { OrderTimeline } from "./OrderTimeline";

const OrdersEmptyIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
);

type OrderSummary = {
  id: string;
  userId: string;
  total: number;
  status: string;
  createdAt: string;
};

type OrderDetail = OrderSummary & {
  items: Array<{
    productId: string;
    name: string;
    price: number;
    quantity: number;
    lineTotal: number;
    isGift?: boolean;
  }>;
};

function orderStatusState(status: string): StatusBadgeState {
  const s = status.toLowerCase();
  if (s === "pending") return "unpaid";
  if (s === "completed") return "paid";
  if (s === "failed") return "overdue";
  return "neutral";
}

export default function OrdersPage() {
  const t = useTranslations("orders");
  const tNav = useTranslations("dashboard.nav");
  const tSmart = useTranslations("smartOrdering");
  const tCart = useTranslations("cart");
  const locale = useLocale();
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reorderingId, setReorderingId] = useState<string | null>(null);
  const [reorderBanner, setReorderBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailsById, setDetailsById] = useState<Record<string, OrderDetail>>({});
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetch("/api/orders", { method: "GET" });
      const json = (await res.json()) as {
        success?: boolean;
        data?: OrderSummary[];
        message?: string;
      };
      if (res.status === 401) {
        setError(t("error"));
        setOrders([]);
        return;
      }
      if (res.status === 200 && json.success && json.data) {
        setOrders(json.data);
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
    void load();
  }, [load]);

  // Live: admin status changes update the list (and any expanded card) without
  // a refresh — this is what advances the timeline in real time.
  useRealtimeRefetch(["order.status_changed"], load);
  useRealtimeEvent(["order.status_changed"], (event) => {
    if (event.type !== "order.status_changed") return;
    setOrders((list) => list.map((o) => (o.id === event.orderId ? { ...o, status: event.status } : o)));
    setDetailsById((map) =>
      map[event.orderId] ? { ...map, [event.orderId]: { ...map[event.orderId], status: event.status } } : map
    );
  });

  async function reorder(orderId: string) {
    setReorderingId(orderId);
    setReorderBanner(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/reorder`, { method: "POST" });
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
      setReorderingId(null);
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

  /** Inline expand: fetch the order detail once, then toggle in place. */
  async function toggleExpand(orderId: string) {
    if (expandedId === orderId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(orderId);
    if (detailsById[orderId]) return;
    setDetailLoadingId(orderId);
    try {
      const res = await fetch(`/api/orders/${orderId}`);
      const json = (await res.json()) as { success?: boolean; data?: OrderDetail };
      if (res.status === 200 && json.success && json.data) {
        const detail = json.data;
        setDetailsById((m) => ({ ...m, [orderId]: detail }));
      }
    } catch {
      // expanded card falls back to the summary info
    } finally {
      setDetailLoadingId(null);
    }
  }

  return (
    <main className="ds-page ds-page--ambient-band">
      <div className="ds-header-row">
        <h1 className={`ds-page-title ${typography.h2}`}>{t("title")}</h1>
        <div className="ds-header-actions">
          <Link href={`/${locale}/dashboard`} className="ds-link">
            {tNav("home")}
          </Link>
          <Link href={`/${locale}/dashboard/cart`} className="ds-link">
            {t("backToCart")}
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
      {reorderBanner ? (
        <p className={reorderBanner.kind === "ok" ? "ds-success-text ds-mb-sm" : "ds-error ds-mb-sm"} role="status">
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

      {!loading && !error && orders.length === 0 ? (
        <div className="ds-empty-state">
          <span className="ds-empty-state__icon" aria-hidden="true">
            <OrdersEmptyIcon />
          </span>
          <p className="ds-empty-state__text">{t("empty")}</p>
          <Link href={`/${locale}/dashboard/products`} className="ds-empty-state__cta">
            <Button variant="primary">{t("emptyCta")}</Button>
          </Link>
        </div>
      ) : null}

      {!loading && orders.length > 0 ? (
        <ul className="ds-list">
          {orders.map((o) => {
            const expanded = expandedId === o.id;
            const detail = detailsById[o.id];
            return (
              <li key={o.id}>
                <Card className="ds-stack ds-stack--tight ds-order-card">
                  <button
                    type="button"
                    className="ds-order-row ds-order-toggle"
                    onClick={() => void toggleExpand(o.id)}
                    aria-expanded={expanded}
                    aria-controls={`order-detail-${o.id}`}
                  >
                    <div className="ds-order-meta">
                      <div className="ds-order-date">{formatDate(o.createdAt)}</div>
                      <div className="ds-text-small ds-order-total-line">
                        <strong>{t("total")}:</strong> {o.total}
                      </div>
                    </div>
                    <StatusBadge status={orderStatusState(o.status)}>{o.status}</StatusBadge>
                    <span className={`ds-order-chevron${expanded ? " ds-order-chevron--open" : ""}`} aria-hidden="true">
                      ▾
                    </span>
                  </button>
                  <OrderTimeline status={o.status} compact />

                  <div
                    id={`order-detail-${o.id}`}
                    className={`ds-order-expand${expanded ? " ds-order-expand--open" : ""}`}
                    hidden={!expanded}
                  >
                    {expanded && detailLoadingId === o.id && !detail ? (
                      <p className="ds-text-muted">{t("loadingDetails")}</p>
                    ) : null}
                    {expanded && detail ? (
                      <>
                        <ul className="ds-order-lines">
                          {detail.items.map((item, i) => (
                            <li key={`${item.productId}-${i}`} className="ds-order-line">
                              <span className="ds-order-line__name">
                                {item.isGift ? "🎁 " : null}
                                {item.name}
                              </span>
                              <span className="ds-order-line__qty">×{item.quantity}</span>
                              <span className="ds-order-line__total">₪{item.lineTotal}</span>
                            </li>
                          ))}
                        </ul>
                        <div className="ds-totals-strip">
                          <span>{t("total")}:</span>
                          <strong>₪{detail.total}</strong>
                        </div>
                        <Link href={`/${locale}/dashboard/orders/${o.id}`} className="ds-link">
                          {t("details")} →
                        </Link>
                      </>
                    ) : null}
                  </div>

                  <Button
                    variant="secondary"
                    block
                    disabled={reorderingId === o.id}
                    onClick={() => void reorder(o.id)}
                  >
                    {reorderingId === o.id ? tSmart("reordering") : tSmart("reorder")}
                  </Button>
                </Card>
              </li>
            );
          })}
        </ul>
      ) : null}
    </main>
  );
}
