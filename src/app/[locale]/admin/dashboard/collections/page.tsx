"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import { useRealtimeRefetch } from "@/components/realtime/realtime-provider";

type CollectionRow = {
  taskId: string;
  orderId: string;
  orderNumber: string;
  customerId: string;
  customerName: string;
  amountMinor: number;
  status: string;
  orderStatus: string;
  createdAt: string;
};

type ApiEnvelope<T> = { success?: boolean; data?: T; message?: string };

/**
 * Open cash/cheque collections (payment feature): an agent sees their own
 * customers' tasks, the admin sees all (incl. unassigned). Marking collected
 * posts the ledger payment with the actor recorded — via the shared path.
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

  // Live: new confirmed agent orders / status changes refresh the list.
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

  function formatDate(iso: string) {
    try {
      return new Date(iso).toLocaleDateString(locale, { dateStyle: "medium" });
    } catch {
      return iso;
    }
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
                <th>{t("collections.columns.created")}</th>
                <th aria-label={t("collections.markCollected")} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.taskId}>
                  <td style={{ fontWeight: 600 }}>{r.customerName}</td>
                  <td dir="ltr">#{r.orderNumber}</td>
                  <td>{money(r.amountMinor)}</td>
                  <td>{r.orderStatus}</td>
                  <td>{formatDate(r.createdAt)}</td>
                  <td>
                    <button
                      type="button"
                      className="admin-btn-primary"
                      disabled={busyId === r.taskId}
                      onClick={() => void markCollected(r.taskId)}
                    >
                      {busyId === r.taskId ? t("collections.collecting") : t("collections.markCollected")}
                    </button>
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
