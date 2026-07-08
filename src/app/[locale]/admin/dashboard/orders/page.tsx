"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

const STATUSES = ["pending", "confirmed", "packed", "out_for_delivery", "delivered", "cancelled"] as const;

type AdminOrderRow = {
  id: string;
  customer: { id: string; businessName: string; phoneNumber: string } | null;
  itemCount: number;
  total: number;
  status: string;
  createdAt: string;
};

export default function AdminOrdersPage() {
  const t = useTranslations("adminDashboard");
  const locale = useLocale();
  const router = useRouter();

  const [orders, setOrders] = useState<AdminOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetch("/api/admin/orders", { method: "GET" });
      if (res.status === 401) {
        router.replace(`/${locale}/admin/login`);
        return;
      }
      const json = (await res.json()) as { success?: boolean; data?: AdminOrderRow[]; message?: string };
      if (res.status === 200 && json.success && json.data) {
        setOrders(json.data);
        return;
      }
      setError(json.message ?? t("orders.error"));
    } catch {
      setError(t("orders.error"));
    } finally {
      setLoading(false);
    }
  }, [locale, router, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function changeStatus(id: string, status: string) {
    const prev = orders;
    setUpdatingId(id);
    setError("");
    // Optimistic: reflect the change immediately, roll back on failure.
    setOrders((list) => list.map((o) => (o.id === id ? { ...o, status } : o)));
    try {
      const res = await fetch(`/api/admin/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.status === 401) {
        router.replace(`/${locale}/admin/login`);
        return;
      }
      const json = (await res.json()) as { success?: boolean; data?: AdminOrderRow; message?: string };
      if (res.status === 200 && json.success && json.data) {
        const updated = json.data;
        setOrders((list) => list.map((o) => (o.id === updated.id ? updated : o)));
        return;
      }
      setOrders(prev);
      setError(json.message ?? t("orders.updateError"));
    } catch {
      setOrders(prev);
      setError(t("orders.updateError"));
    } finally {
      setUpdatingId(null);
    }
  }

  function formatDate(iso: string) {
    try {
      return new Date(iso).toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
    } catch {
      return iso;
    }
  }

  function statusLabel(s: string) {
    return (STATUSES as readonly string[]).includes(s) ? t(`orders.status.${s}`) : s;
  }

  return (
    <div>
      <Link href={`/${locale}/admin/dashboard`} className="admin-back-link">
        ← {t("hub.backToDashboard")}
      </Link>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "0.35rem" }}>{t("orders.title")}</h1>
      <p style={{ color: "var(--text-muted)", marginBottom: "1.5rem" }}>{t("orders.subtitle")}</p>

      {error ? <p style={{ color: "var(--danger)", marginBottom: "1rem" }}>{error}</p> : null}

      {loading ? (
        <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "3rem 0" }}>{t("orders.loading")}</p>
      ) : orders.length === 0 ? (
        <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "3rem 0" }}>{t("orders.empty")}</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t("orders.columns.customer")}</th>
                <th>{t("orders.columns.phone")}</th>
                <th>{t("orders.columns.date")}</th>
                <th>{t("orders.columns.items")}</th>
                <th>{t("orders.columns.total")}</th>
                <th>{t("orders.columns.status")}</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const options = (STATUSES as readonly string[]).includes(o.status)
                  ? (STATUSES as readonly string[])
                  : [o.status, ...STATUSES];
                return (
                  <tr key={o.id}>
                    <td style={{ fontWeight: 600 }}>{o.customer?.businessName ?? t("orders.unknownCustomer")}</td>
                    <td dir="ltr">{o.customer?.phoneNumber ?? "—"}</td>
                    <td>{formatDate(o.createdAt)}</td>
                    <td>{o.itemCount}</td>
                    <td>₪ {o.total}</td>
                    <td>
                      <select
                        className="admin-select"
                        value={o.status}
                        disabled={updatingId === o.id}
                        onChange={(e) => void changeStatus(o.id, e.target.value)}
                        aria-label={t("orders.columns.status")}
                      >
                        {options.map((s) => (
                          <option key={s} value={s}>
                            {statusLabel(s)}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
