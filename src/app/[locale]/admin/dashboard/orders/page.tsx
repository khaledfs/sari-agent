"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { ORDER_STATUSES } from "@/lib/order-constants";

type OrderRow = {
  _id: string;
  customerName: string;
  customerEmail: string;
  itemCount: number;
  total: number;
  status: string;
  createdAt: string;
};

const STATUS_COLORS: Record<string, string> = {
  pending:    "admin-badge-muted",
  processing: "admin-badge-warning",
  fulfilled:  "admin-badge-success",
  cancelled:  "admin-badge-danger",
};

export default function AdminOrdersPage() {
  const locale = useLocale();
  const t = useTranslations("adminDashboard");

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const load = useCallback(async (status: string) => {
    setLoading(true);
    setError("");
    try {
      const url = status === "all" ? "/api/admin/orders" : `/api/admin/orders?status=${status}`;
      const res = await fetch(url);
      const json = (await res.json()) as { success: boolean; data?: OrderRow[]; message?: string };
      if (json.success && json.data) {
        setOrders(json.data);
      } else {
        setError(json.message ?? t("orders.error"));
      }
    } catch {
      setError(t("orders.error"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { void load(filter); }, [filter, load]);

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 2800);
  }

  async function updateStatus(orderId: string, newStatus: string) {
    setUpdatingId(orderId);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const json = (await res.json()) as { success: boolean; message?: string };
      if (json.success) {
        setOrders((prev) => prev.map((o) => o._id === orderId ? { ...o, status: newStatus } : o));
        showToast(t("orders.statusUpdated"), true);
      } else {
        showToast(json.message ?? t("orders.updateError"), false);
      }
    } catch {
      showToast(t("orders.updateError"), false);
    } finally {
      setUpdatingId(null);
    }
  }

  function formatDate(iso: string) {
    try {
      return new Date(iso).toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
    } catch { return iso; }
  }

  function shortId(id: string) {
    return id.slice(-6).toUpperCase();
  }

  const filterKeys = ["all", ...ORDER_STATUSES] as const;

  return (
    <div>
      {toast ? (
        <div style={{
          position: "fixed", top: "1rem", insetInlineEnd: "1rem", zIndex: 200,
          padding: "0.65rem 1.1rem", borderRadius: "var(--radius-lg)",
          background: toast.ok ? "var(--success-bg)" : "var(--danger-bg)",
          color: toast.ok ? "var(--success)" : "var(--danger)",
          border: `1px solid ${toast.ok ? "rgba(74,158,110,0.3)" : "rgba(192,53,53,0.3)"}`,
          fontSize: "0.875rem", fontWeight: 600, boxShadow: "var(--shadow-md)",
          animation: "auth-card-enter 200ms ease both",
        }}>
          {toast.msg}
        </div>
      ) : null}

      <Link href={`/${locale}/admin/dashboard`} className="admin-back-link">
        ← {t("hub.backToDashboard")}
      </Link>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: "0.75rem" }}>
        <h1 style={{ fontSize: "1.5rem", margin: 0, fontFamily: "var(--font-display, serif)" }}>
          {t("orders.title")}
        </h1>
        <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
          {!loading ? `${orders.length} ${filter === "all" ? "" : t(`orders.filters.${filter as typeof ORDER_STATUSES[number]}`)}` : ""}
        </span>
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: "0.25rem", marginBottom: "1.25rem", overflowX: "auto", paddingBottom: "0.25rem" }}>
        {filterKeys.map((key) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            style={{
              padding: "0.4rem 0.85rem",
              borderRadius: "var(--radius-pill)",
              border: `1px solid ${filter === key ? "rgba(200,144,47,0.4)" : "var(--border-strong)"}`,
              background: filter === key ? "rgba(200,144,47,0.12)" : "var(--surface-2)",
              color: filter === key ? "var(--brand)" : "var(--text-muted)",
              fontSize: "0.8125rem",
              fontWeight: 600,
              cursor: "pointer",
              whiteSpace: "nowrap",
              transition: "all 150ms ease",
            }}
          >
            {key === "all" ? t("orders.filters.all") : t(`orders.filters.${key as typeof ORDER_STATUSES[number]}`)}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "3rem 0" }}>
          <div className="admin-spinner" />
        </div>
      ) : error ? (
        <p style={{ color: "var(--danger)", textAlign: "center", padding: "2rem 0" }}>{error}</p>
      ) : orders.length === 0 ? (
        <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "3rem 0" }}>{t("orders.empty")}</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t("orders.columns.id")}</th>
                <th>{t("orders.columns.customer")}</th>
                <th style={{ textAlign: "center" }}>{t("orders.columns.items")}</th>
                <th style={{ textAlign: "end" }}>{t("orders.columns.total")}</th>
                <th>{t("orders.columns.status")}</th>
                <th>{t("orders.columns.date")}</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order._id}>
                  <td>
                    <span style={{
                      fontFamily: "monospace", fontSize: "0.8rem",
                      background: "var(--surface-3)", padding: "0.15rem 0.45rem",
                      borderRadius: "var(--radius-sm)", color: "var(--text-secondary)",
                      border: "1px solid var(--border-strong)",
                    }}>
                      #{shortId(order._id)}
                    </span>
                  </td>
                  <td>
                    <div style={{ fontWeight: 600, fontSize: "0.875rem" }}>{order.customerName}</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{order.customerEmail}</div>
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <span style={{ fontWeight: 600 }}>{order.itemCount}</span>
                  </td>
                  <td style={{ textAlign: "end", fontWeight: 700, color: "var(--brand-hover)" }}>
                    {order.total.toFixed(2)}
                  </td>
                  <td>
                    <select
                      value={order.status}
                      disabled={updatingId === order._id}
                      onChange={(e) => void updateStatus(order._id, e.target.value)}
                      style={{
                        padding: "0.28rem 0.55rem",
                        borderRadius: "var(--radius-pill)",
                        border: "1px solid var(--border-gold)",
                        background: "var(--surface-3)",
                        color: "var(--text-primary)",
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        cursor: "pointer",
                        opacity: updatingId === order._id ? 0.5 : 1,
                        appearance: "auto",
                      }}
                    >
                      {ORDER_STATUSES.map((s) => (
                        <option key={s} value={s} style={{ background: "var(--surface-2)" }}>
                          {t(`orders.filters.${s}`)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>
                    {formatDate(order.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
