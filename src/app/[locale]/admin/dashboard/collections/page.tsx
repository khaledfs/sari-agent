"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import { useRealtimeRefetch } from "@/components/realtime/realtime-provider";

type CollectionRow = {
  taskId: string | null;
  orderId: string;
  orderNumber: string;
  customerId: string;
  customerName: string;
  amountMinor: number;
  orderStatus: string;
  state: "collectible" | "pending";
  createdAt: string;
};

type ApiEnvelope<T> = { success?: boolean; data?: T; message?: string };

const KNOWN_STATUSES = ["pending", "confirmed", "packed", "out_for_delivery", "delivered", "cancelled"] as const;

/**
 * Cash/cheque collections (payment feature): an agent sees their own customers'
 * agent-paid orders, the admin sees all. Rows are "collectible" (an open task
 * exists → mark-collected posts the ledger payment with the actor recorded) or
 * "pending" (order not yet approved → not yet collectible). Oldest-first.
 */
export default function CollectionsPage() {
  const t = useTranslations("adminDashboard");
  const locale = useLocale();
  const router = useRouter();

  const [rows, setRows] = useState<CollectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetch("/api/admin/collections");
      if (res.status === 401) {
        router.replace(`/${locale}/admin/login`);
        return;
      }
      const json = (await res.json()) as ApiEnvelope<CollectionRow[]>;
      if (res.status === 200 && json.success && json.data) {
        setRows(json.data);
        return;
      }
      setError(json.message ?? t("collections.error"));
    } catch {
      setError(t("collections.error"));
    } finally {
      setLoading(false);
    }
  }, [locale, router, t]);

  useEffect(() => {
    void load();
  }, [load]);

  // Live: new confirmed agent orders / status changes / collections refresh the list.
  useRealtimeRefetch(["order.status_changed", "ledger.entry_created"], load);

  async function markCollected(taskId: string) {
    if (busyId) return;
    setBusyId(taskId);
    setError("");
    const previous = rows;
    // Optimistic remove with rollback (existing admin pattern).
    setRows((list) => list.filter((r) => r.taskId !== taskId));
    try {
      const res = await fetch(`/api/admin/collections/${taskId}/collect`, { method: "POST" });
      const json = (await res.json()) as ApiEnvelope<{ ok: boolean }>;
      if (res.status !== 200 || !json.success) {
        setRows(previous);
        setError(json.message ?? t("collections.error"));
      }
    } catch {
      setRows(previous);
      setError(t("collections.error"));
    } finally {
      setBusyId(null);
    }
  }

  function money(n: number) {
    return `₪${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n / 100)}`;
  }

  function statusLabel(s: string) {
    return (KNOWN_STATUSES as readonly string[]).includes(s) ? t(`orders.status.${s}`) : s;
  }

  function ageLabel(iso: string) {
    if (!iso) return "";
    const ms = Date.now() - new Date(iso).getTime();
    const days = Math.max(0, Math.floor(ms / 86_400_000));
    return t("collections.ageDays", { days });
  }

  return (
    <div>
      <Link href={`/${locale}/admin/dashboard`} className="admin-back-link">
        ← {t("hub.backToDashboard")}
      </Link>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "0.35rem" }}>{t("collections.title")}</h1>
      <p style={{ color: "var(--text-muted)", marginBottom: "1.25rem" }}>{t("collections.subtitle")}</p>

      {error ? (
        <p style={{ color: "var(--danger)", marginBottom: "1rem" }} role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "3rem 0" }}>{t("collections.loading")}</p>
      ) : rows.length === 0 ? (
        <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "3rem 0" }}>{t("collections.empty")}</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t("collections.columns.customer")}</th>
                <th>{t("collections.columns.order")}</th>
                <th>{t("collections.columns.amount")}</th>
                <th>{t("collections.columns.delivery")}</th>
                <th>{t("collections.columns.age")}</th>
                <th aria-label={t("collections.markCollected")} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.orderId} style={r.state === "pending" ? { opacity: 0.7 } : undefined}>
                  <td style={{ fontWeight: 600 }}>{r.customerName}</td>
                  <td dir="ltr">#{r.orderNumber}</td>
                  <td>{money(r.amountMinor)}</td>
                  <td>{statusLabel(r.orderStatus)}</td>
                  <td>{ageLabel(r.createdAt)}</td>
                  <td>
                    {r.state === "collectible" && r.taskId ? (
                      <button
                        type="button"
                        className="admin-btn-primary"
                        disabled={busyId === r.taskId}
                        onClick={() => void markCollected(r.taskId!)}
                      >
                        {busyId === r.taskId
                          ? t("collections.collecting")
                          : t("collections.collectFrom", { amount: money(r.amountMinor) })}
                      </button>
                    ) : (
                      <span className="admin-stock-badge" style={{ opacity: 0.85 }}>
                        {t("collections.notCollectible")}
                      </span>
                    )}
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
