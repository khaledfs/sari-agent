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
  amountMinor: number; // owed NOW (outstanding)
  paidMinor: number;
  orderStatus: string;
  state: "collectible" | "pending";
  createdAt: string;
};

type ApiEnvelope<T> = { success?: boolean; data?: T; message?: string };

const KNOWN_STATUSES = ["pending", "confirmed", "packed", "out_for_delivery", "delivered", "cancelled"] as const;

/**
 * Cash/cheque collections (payment feature). "Collect" opens a form — amount
 * (defaults to the outstanding but a partial is allowed), cash or cheque with
 * metadata — and records ONE order-anchored payment through the unified path,
 * so the ledger and this view can never double-count.
 */
export default function CollectionsPage() {
  const t = useTranslations("adminDashboard");
  const locale = useLocale();
  const router = useRouter();

  const [rows, setRows] = useState<CollectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Collect form (per selected task).
  const [collectRow, setCollectRow] = useState<CollectionRow | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"cash" | "cheque">("cash");
  const [chequeNumber, setChequeNumber] = useState("");
  const [chequeDate, setChequeDate] = useState("");
  const [chequeBank, setChequeBank] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

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

  // Live: new confirmed agent orders / status changes / payments refresh the list.
  useRealtimeRefetch(["order.status_changed", "ledger.entry_created"], load);

  function money(n: number) {
    return `₪${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n / 100)}`;
  }

  function openCollect(row: CollectionRow) {
    setCollectRow(row);
    setAmount((row.amountMinor / 100).toFixed(2)); // default to the outstanding, editable
    setMethod("cash");
    setChequeNumber("");
    setChequeDate("");
    setChequeBank("");
    setNote("");
    setFormError("");
  }

  async function submitCollect() {
    if (!collectRow?.taskId) return;
    const major = Number(amount);
    if (!Number.isFinite(major) || major <= 0) {
      setFormError(t("collections.form.amountInvalid"));
      return;
    }
    const amountMinor = Math.round(major * 100);
    if (amountMinor > collectRow.amountMinor) {
      setFormError(t("collections.form.overpay", { amount: money(collectRow.amountMinor) }));
      return;
    }
    if (method === "cheque" && (!chequeNumber.trim() || !chequeDate)) {
      setFormError(t("collections.form.chequeRequired"));
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      const res = await fetch(`/api/admin/collections/${collectRow.taskId}/collect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountMinor,
          method,
          ...(method === "cheque"
            ? {
                chequeNumber: chequeNumber.trim(),
                chequeDate: new Date(`${chequeDate}T00:00:00`).toISOString(),
                chequeBank: chequeBank.trim() || undefined,
              }
            : {}),
          note: note.trim() || undefined,
        }),
      });
      const json = (await res.json()) as ApiEnvelope<{ ok: boolean; outstandingMinor: number; settled: boolean }>;
      if (res.status === 200 && json.success) {
        setCollectRow(null);
        await load();
        return;
      }
      setFormError(json.message ?? t("collections.error"));
    } catch {
      setFormError(t("collections.error"));
    } finally {
      setSaving(false);
    }
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
          <table className="admin-table admin-table--cards">
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
                  <td className="admin-card-cell--title" style={{ fontWeight: 600 }}>{r.customerName}</td>
                  <td data-label={t("collections.columns.order")} dir="ltr">#{r.orderNumber}</td>
                  <td data-label={t("collections.columns.amount")}>
                    {money(r.amountMinor)}
                    {r.paidMinor > 0 ? (
                      <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                        {" "}
                        ({t("collections.paidSoFar", { amount: money(r.paidMinor) })})
                      </span>
                    ) : null}
                  </td>
                  <td data-label={t("collections.columns.delivery")}>{statusLabel(r.orderStatus)}</td>
                  <td data-label={t("collections.columns.age")}>{ageLabel(r.createdAt)}</td>
                  <td className="admin-card-cell--actions">
                    {r.state === "collectible" && r.taskId ? (
                      <button type="button" className="admin-btn-primary" onClick={() => openCollect(r)}>
                        {t("collections.collectFrom", { amount: money(r.amountMinor) })}
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

      {collectRow ? (
        <div
          className="admin-modal-backdrop admin-modal-backdrop--sheet"
          role="dialog"
          aria-modal="true"
          aria-label={t("collections.form.title")}
          onClick={(e) => {
            if (e.target === e.currentTarget && !saving) setCollectRow(null);
          }}
        >
          <div className="admin-modal">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem", gap: "0.5rem" }}>
              <h2 style={{ fontSize: "1.15rem" }}>{t("collections.form.title")}</h2>
              <button type="button" className="admin-btn" disabled={saving} onClick={() => setCollectRow(null)}>
                ← {t("products.form.cancel")}
              </button>
            </div>
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "1rem" }}>
              {collectRow.customerName} · <span dir="ltr">#{collectRow.orderNumber}</span> ·{" "}
              {t("collections.form.outstanding", { amount: money(collectRow.amountMinor) })}
            </p>

            <label className="admin-field">
              <span>{t("collections.form.amount")}</span>
              <input
                className="admin-input"
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>

            <div className="admin-field">
              <span>{t("collections.form.method")}</span>
              <div style={{ display: "flex", gap: "1rem", marginBlockStart: "0.35rem" }}>
                {(["cash", "cheque"] as const).map((m) => (
                  <label key={m} style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                    <input type="radio" name="collect-method" checked={method === m} onChange={() => setMethod(m)} />
                    {t(`collections.form.${m}`)}
                  </label>
                ))}
              </div>
            </div>

            {method === "cheque" ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <label className="admin-field">
                  <span>{t("collections.form.chequeNumber")}</span>
                  <input className="admin-input" value={chequeNumber} maxLength={60} onChange={(e) => setChequeNumber(e.target.value)} />
                </label>
                <label className="admin-field">
                  <span>{t("collections.form.chequeDate")}</span>
                  <input className="admin-input" type="date" value={chequeDate} onChange={(e) => setChequeDate(e.target.value)} />
                </label>
                <label className="admin-field" style={{ gridColumn: "1 / -1" }}>
                  <span>{t("collections.form.chequeBank")}</span>
                  <input className="admin-input" value={chequeBank} maxLength={120} onChange={(e) => setChequeBank(e.target.value)} />
                </label>
              </div>
            ) : null}

            <label className="admin-field">
              <span>{t("collections.form.note")}</span>
              <input className="admin-input" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
            </label>

            {formError ? <p style={{ color: "var(--danger)", marginTop: "0.25rem" }} role="alert">{formError}</p> : null}

            <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.25rem", justifyContent: "flex-end" }}>
              <button type="button" className="admin-btn" disabled={saving} onClick={() => setCollectRow(null)}>
                {t("products.form.cancel")}
              </button>
              <button type="button" className="admin-btn-primary" disabled={saving} onClick={() => void submitCollect()}>
                {saving ? t("collections.collecting") : t("collections.form.record")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
