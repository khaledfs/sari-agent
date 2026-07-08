"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import type { CheckStatus, InvoiceStatus } from "@/services/financial.service";

type LedgerData = {
  summary: {
    balance: number;
    totalDebt: number;
    lastPaymentDate: string | null;
  };
  payments: Array<{ date: string; amount: number }>;
  checks: Array<{
    id: string;
    checkNumber: string;
    bankName: string;
    amount: number;
    date: string;
    status: CheckStatus;
  }>;
  invoices: Array<{
    id: string;
    invoiceNumber: string;
    date: string;
    dueDate: string;
    amount: number;
    status: InvoiceStatus;
  }>;
};

function invoiceBadgeClass(status: InvoiceStatus) {
  if (status === "paid") return "ds-badge ds-badge--paid";
  if (status === "unpaid") return "ds-badge ds-badge--unpaid";
  return "ds-badge ds-badge--overdue";
}

function checkBadgeClass(status: CheckStatus) {
  if (status === "cleared") return "ds-badge ds-badge--paid";
  if (status === "pending") return "ds-badge ds-badge--unpaid";
  return "ds-badge ds-badge--overdue";
}

export default function LedgerPage() {
  const t = useTranslations("ledger");
  const tAcc = useTranslations("account");
  const tInv = useTranslations("invoices");
  const tNav = useTranslations("dashboard.nav");
  const locale = useLocale();
  const [data, setData] = useState<LedgerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetch("/api/account/ledger", { method: "GET" });
      const json = (await res.json()) as {
        success?: boolean;
        data?: LedgerData;
        message?: string;
      };
      if (res.status === 401) {
        setError(t("error"));
        setData(null);
        return;
      }
      if (res.status === 200 && json.success && json.data) {
        setData(json.data);
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

  function formatDate(iso: string | null, withTime = false) {
    if (!iso) return "—";
    try {
      return new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        ...(withTime ? { timeStyle: "short" } : {}),
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  }

  function formatMoney(value: number) {
    try {
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency: "ILS",
        maximumFractionDigits: 2,
      }).format(value);
    } catch {
      return String(value);
    }
  }

  function invoiceStatusLabel(status: InvoiceStatus) {
    if (status === "paid") return tInv("paid");
    if (status === "unpaid") return tInv("unpaid");
    return tInv("overdue");
  }

  function checkStatusLabel(status: CheckStatus) {
    if (status === "cleared") return t("checkStatus.cleared");
    if (status === "pending") return t("checkStatus.pending");
    return t("checkStatus.returned");
  }

  return (
    <main className="ds-page">
      <div className="ds-header-row">
        <div>
          <h1 className="ds-page-title">{t("title")}</h1>
          <p className="ds-page-subtitle">{t("subtitle")}</p>
        </div>
        <Link href={`/${locale}/dashboard`} className="ds-link">
          ← {tNav("home")}
        </Link>
      </div>

      {loading ? <p className="ds-text-muted">{t("loading")}</p> : null}
      {error ? <p className="ds-error">{error}</p> : null}

      {!loading && data ? (
        <div className="ds-stack ds-content-after-title">
          <section className="ds-card ds-stack ds-stack--tight" aria-labelledby="ledger-summary-heading">
            <h2 id="ledger-summary-heading" className="ds-section-title">
              {t("sections.summary")}
            </h2>
            <p className="ds-text-small">
              <strong>{tAcc("balance")}:</strong> {formatMoney(data.summary.balance)}
            </p>
            <p className="ds-text-small">
              <strong>{tAcc("totalDebt")}:</strong> {formatMoney(data.summary.totalDebt)}
            </p>
            <p className="ds-text-small">
              <strong>{tAcc("lastPaymentDate")}:</strong> {formatDate(data.summary.lastPaymentDate, true)}
            </p>
          </section>

          <section className="ds-card ds-stack ds-stack--tight" aria-labelledby="ledger-payments-heading">
            <h2 id="ledger-payments-heading" className="ds-section-title">
              {t("sections.payments")}
            </h2>
            {data.payments.length === 0 ? (
              <p className="ds-text-muted">{tAcc("noPayments")}</p>
            ) : (
              <ul className="ds-list">
                {data.payments.map((p, index) => (
                  <li key={`${p.date}-${index}`} className="ds-payment-row">
                    <span className="ds-text-small">
                      <strong>{tAcc("paymentDate")}:</strong> {formatDate(p.date, true)}
                    </span>
                    <span className="ds-text-small">
                      <strong>{tAcc("paymentAmount")}:</strong> {formatMoney(p.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="ds-card ds-stack ds-stack--tight" aria-labelledby="ledger-checks-heading">
            <h2 id="ledger-checks-heading" className="ds-section-title">
              {t("sections.checks")}
            </h2>
            {data.checks.length === 0 ? (
              <p className="ds-text-muted">{t("checksEmpty")}</p>
            ) : (
              <ul className="ds-list">
                {data.checks.map((c) => (
                  <li key={c.id} className="ds-card ds-stack ds-stack--tight">
                    <div className="ds-invoice-card-header">
                      <span className="ds-invoice-number">
                        {t("checkNumber")} {c.checkNumber}
                      </span>
                      <span className={checkBadgeClass(c.status)}>{checkStatusLabel(c.status)}</span>
                    </div>
                    <p className="ds-text-small">
                      <strong>{t("bank")}:</strong> {c.bankName}
                    </p>
                    <p className="ds-text-small">
                      <strong>{t("checkDate")}:</strong> {formatDate(c.date)}
                    </p>
                    <p className="ds-text-small">
                      <strong>{t("amount")}:</strong> {formatMoney(c.amount)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="ds-card ds-stack ds-stack--tight" aria-labelledby="ledger-invoices-heading">
            <h2 id="ledger-invoices-heading" className="ds-section-title">
              {t("sections.invoices")}
            </h2>
            {data.invoices.length === 0 ? (
              <p className="ds-text-muted">{tInv("empty")}</p>
            ) : (
              <ul className="ds-list">
                {data.invoices.map((inv) => (
                  <li key={inv.id} className="ds-card ds-stack ds-stack--tight">
                    <div className="ds-invoice-card-header">
                      <span className="ds-invoice-number">{inv.invoiceNumber}</span>
                      <span className={invoiceBadgeClass(inv.status)}>{invoiceStatusLabel(inv.status)}</span>
                    </div>
                    <p className="ds-text-small">
                      <strong>{tInv("date")}:</strong> {formatDate(inv.date)}
                    </p>
                    <p className="ds-text-small">
                      <strong>{tInv("dueDate")}:</strong> {formatDate(inv.dueDate)}
                    </p>
                    <p className="ds-text-small">
                      <strong>{tInv("amount")}:</strong> {formatMoney(inv.amount)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : null}
    </main>
  );
}
