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

export default function OrdersPage() {
  const t = useTranslations("orders");
  const locale = useLocale();
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
      <div style={{ marginBottom: "1rem", display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
        <h1 style={{ fontSize: "1.35rem", fontWeight: 700, flex: "1 1 auto" }}>{t("title")}</h1>
        <Link href={`/${locale}/dashboard/cart`} style={{ fontSize: "0.95rem", color: "#2563eb" }}>
          {t("backToCart")}
        </Link>
      </div>

      {loading ? <p>{t("loading")}</p> : null}
      {error ? <p style={{ color: "crimson" }}>{error}</p> : null}

      {!loading && !error && orders.length === 0 ? <p style={{ color: "#666" }}>{t("empty")}</p> : null}

      {!loading && orders.length > 0 ? (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "0.65rem" }}>
          {orders.map((o) => (
            <li key={o.id}>
              <Link
                href={`/${locale}/dashboard/orders/${o.id}`}
                style={{
                  display: "block",
                  border: "1px solid #ddd",
                  borderRadius: "10px",
                  padding: "0.75rem",
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <div style={{ fontWeight: 600 }}>{formatDate(o.createdAt)}</div>
                <div style={{ marginTop: "0.25rem", fontSize: "0.95rem" }}>
                  {t("total")}: {o.total}
                </div>
                <div style={{ marginTop: "0.2rem", fontSize: "0.9rem", color: "#555" }}>
                  {t("status")}: {o.status}
                </div>
                <div style={{ marginTop: "0.35rem", fontSize: "0.9rem", color: "#2563eb" }}>{t("details")} →</div>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </main>
  );
}
