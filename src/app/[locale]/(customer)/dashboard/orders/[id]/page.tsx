"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

type OrderItem = {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  lineTotal: number;
};

type OrderDetail = {
  id: string;
  userId: string;
  items: OrderItem[];
  total: number;
  status: string;
  createdAt: string;
};

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reordering, setReordering] = useState(false);
  const [reorderBanner, setReorderBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

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

      {loading ? <p className="ds-text-muted ds-mt-sm">{t("loading")}</p> : null}
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
              <strong>{t("createdAt")}:</strong> {formatDate(order.createdAt)}
            </p>
          </div>

          <h2 className="ds-section-title">{t("items")}</h2>
          <ul className="ds-list">
            {order.items.map((item, index) => (
              <li key={`${item.productId}-${index}`} className="ds-card ds-stack ds-stack--tight">
                <p className="ds-product-name">{item.name}</p>
                <p className="ds-text-small">
                  <strong>{t("quantity")}:</strong> {item.quantity}
                </p>
                <p className="ds-text-small">
                  <strong>{t("itemPrice")}:</strong> {item.price}
                </p>
                <p className="ds-text-small">
                  <strong>{t("lineTotal")}:</strong> {item.lineTotal}
                </p>
              </li>
            ))}
          </ul>

          <div className="ds-totals-strip">
            <strong>{t("total")}:</strong> {order.total}
          </div>

          <button
            type="button"
            className="ds-btn ds-btn--secondary ds-btn--block"
            disabled={reordering}
            onClick={() => void reorder()}
          >
            {reordering ? tSmart("reordering") : tSmart("reorder")}
          </button>
        </div>
      ) : null}
    </main>
  );
}
