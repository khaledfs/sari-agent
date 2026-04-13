"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

type OrderSummary = {
  id: string;
  userId: string;
  total: number;
  status: string;
  createdAt: string;
};

function orderStatusBadgeClass(status: string) {
  const s = status.toLowerCase();
  if (s === "pending") return "ds-badge ds-badge--unpaid";
  return "ds-badge ds-badge--neutral";
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
        <h1 className="ds-page-title">{t("title")}</h1>
        <div className="ds-header-actions">
          <Link href={`/${locale}/dashboard`} className="ds-link">
            {tNav("home")}
          </Link>
          <Link href={`/${locale}/dashboard/cart`} className="ds-link">
            {t("backToCart")}
          </Link>
        </div>
      </div>

      {loading ? <p className="ds-text-muted">{t("loading")}</p> : null}
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

      {!loading && !error && orders.length === 0 ? <p className="ds-text-muted">{t("empty")}</p> : null}

      {!loading && orders.length > 0 ? (
        <ul className="ds-list">
          {orders.map((o) => (
            <li key={o.id}>
              <div className="ds-card ds-stack ds-stack--tight">
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
                  <span className={orderStatusBadgeClass(o.status)}>{o.status}</span>
                </div>
                <button
                  type="button"
                  className="ds-btn ds-btn--secondary ds-btn--block"
                  disabled={reorderingId === o.id}
                  onClick={() => void reorder(o.id)}
                >
                  {reorderingId === o.id ? tSmart("reordering") : tSmart("reorder")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </main>
  );
}
