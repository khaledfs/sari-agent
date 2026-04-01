"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

type InvoiceStatus = "paid" | "unpaid" | "overdue";

type InvoiceRow = {
  id: string;
  invoiceNumber: string;
  date: string;
  dueDate: string;
  amount: number;
  status: InvoiceStatus;
};

function statusBadgeClass(status: InvoiceStatus) {
  if (status === "paid") return "ds-badge ds-badge--paid";
  if (status === "unpaid") return "ds-badge ds-badge--unpaid";
  return "ds-badge ds-badge--overdue";
}

export default function InvoicesPage() {
  const t = useTranslations("invoices");
  const tNav = useTranslations("dashboard.nav");
  const locale = useLocale();
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetch("/api/account/invoices", { method: "GET" });
      const json = (await res.json()) as {
        success?: boolean;
        data?: { invoices: InvoiceRow[] };
        message?: string;
      };
      if (res.status === 401) {
        setError(t("error"));
        setInvoices([]);
        return;
      }
      if (res.status === 200 && json.success && json.data?.invoices) {
        setInvoices(json.data.invoices);
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
      return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(iso));
    } catch {
      return iso;
    }
  }

  function statusLabel(status: InvoiceStatus) {
    if (status === "paid") return t("paid");
    if (status === "unpaid") return t("unpaid");
    return t("overdue");
  }

  return (
    <main className="ds-page">
      <div className="ds-header-row">
        <h1 className="ds-page-title">{t("title")}</h1>
        <Link href={`/${locale}/dashboard`} className="ds-link">
          ← {tNav("home")}
        </Link>
      </div>

      {loading ? <p className="ds-text-muted">{t("loading")}</p> : null}
      {error ? <p className="ds-error">{error}</p> : null}

      {!loading && !error && invoices.length === 0 ? <p className="ds-text-muted">{t("empty")}</p> : null}

      {!loading && invoices.length > 0 ? (
        <ul className="ds-list">
          {invoices.map((inv) => (
            <li key={inv.id} className="ds-card ds-stack ds-stack--tight">
              <div className="ds-invoice-card-header">
                <span className="ds-invoice-number">{inv.invoiceNumber}</span>
                <span className={statusBadgeClass(inv.status)}>{statusLabel(inv.status)}</span>
              </div>
              <p className="ds-text-small">
                <strong>{t("date")}:</strong> {formatDate(inv.date)}
              </p>
              <p className="ds-text-small">
                <strong>{t("dueDate")}:</strong> {formatDate(inv.dueDate)}
              </p>
              <p className="ds-text-small">
                <strong>{t("amount")}:</strong> {inv.amount}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </main>
  );
}
