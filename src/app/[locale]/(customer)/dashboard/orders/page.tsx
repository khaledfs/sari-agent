"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
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

  return (
    <main className="ds-page">
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
          {orders.map((o) => (
            <li key={o.id}>
              <Card className="ds-stack ds-stack--tight ds-order-card">
                <div className="ds-order-row">
                  <Link href={`/${locale}/dashboard/orders/${o.id}`} className="ds-order-list-link">
                    <div className="ds-order-meta">
                      <div className="ds-order-date">{formatDate(o.createdAt)}</div>
                      <div className="ds-text-small ds-order-total-line">
                        <strong>{t("total")}:</strong> {o.total}
                      </div>
                    </div>
                    <div className="ds-details-cta">{t("details")} →</div>
                  </Link>
                  <StatusBadge status={orderStatusState(o.status)}>{o.status}</StatusBadge>
                </div>
                <OrderTimeline status={o.status} compact />
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
          ))}
        </ul>
      ) : null}
    </main>
  );
}
