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

export default function OrderDetailPage() {
  const t = useTranslations("orders");
  const locale = useLocale();
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
    <main style={{ width: "100%", maxWidth: "640px", margin: "0 auto", padding: "1rem" }}>
      <div style={{ marginBottom: "1rem" }}>
        <Link href={`/${locale}/dashboard/orders`} style={{ fontSize: "0.95rem", color: "#2563eb" }}>
          ← {t("backToList")}
        </Link>
      </div>

      {loading ? <p>{t("loading")}</p> : null}
      {error ? <p style={{ color: "crimson" }}>{error}</p> : null}

      {!loading && order ? (
        <>
          <h1 style={{ fontSize: "1.35rem", fontWeight: 700 }}>{t("details")}</h1>
          <p style={{ marginTop: "0.5rem", color: "#444" }}>
            {t("createdAt")}: {formatDate(order.createdAt)}
          </p>
          <p style={{ marginTop: "0.25rem" }}>
            {t("status")}: {order.status}
          </p>

          <h2 style={{ fontSize: "1.05rem", fontWeight: 600, marginTop: "1rem" }}>{t("items")}</h2>
          <ul style={{ listStyle: "none", padding: 0, margin: "0.5rem 0 0", display: "grid", gap: "0.6rem" }}>
            {order.items.map((item, index) => (
              <li
                key={`${item.productId}-${index}`}
                style={{
                  border: "1px solid #eee",
                  borderRadius: "8px",
                  padding: "0.65rem",
                  display: "grid",
                  gap: "0.25rem",
                }}
              >
                <strong>{item.name}</strong>
                <span style={{ fontSize: "0.95rem" }}>
                  {t("quantity")}: {item.quantity}
                </span>
                <span style={{ fontSize: "0.95rem" }}>
                  {t("itemPrice")}: {item.price}
                </span>
                <span style={{ fontSize: "0.95rem" }}>
                  {t("lineTotal")}: {item.lineTotal}
                </span>
              </li>
            ))}
          </ul>

          <p style={{ marginTop: "1rem", fontWeight: 600 }}>
            {t("total")}: {order.total}
          </p>
        </>
      ) : null}
    </main>
  );
}
