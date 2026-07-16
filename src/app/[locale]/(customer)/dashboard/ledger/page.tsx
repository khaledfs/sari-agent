"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { useRealtimeRefetch } from "@/components/realtime/realtime-provider";
import { formatMinorUnits } from "@/lib/money";
import { shortOrderNumber } from "@/components/orders/order-view";

/**
 * Real customer ledger (Work Order Issue 8) — replaces the former mock
 * payments/checks/invoices screen. Amounts arrive as integers in agorot and
 * are rendered without client-side float math (formatMinorUnits).
 */

type LedgerEntry = {
  id: string;
  type: "order_charge" | "payment" | "credit" | "refund" | "adjustment" | "opening_balance";
  orderId: string | null;
  description: string;
  debitMinor: number;
  creditMinor: number;
  currency: string;
  status: "posted" | "void";
  createdAt: string;
  balanceAfterMinor: number;
};

type LedgerData = {
  entries: LedgerEntry[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
  summary: {
    currentBalanceMinor: number;
    currency: string;
    lastEntryAt: string | null;
  };
};

function typeBadgeClass(type: LedgerEntry["type"]) {
  if (type === "order_charge" || type === "adjustment" || type === "opening_balance") {
    return "ds-badge ds-badge--unpaid";
  }
  return "ds-badge ds-badge--paid";
}

export default function LedgerPage() {
  const t = useTranslations("ledger");
  const tNav = useTranslations("dashboard.nav");
  const locale = useLocale();
  const [data, setData] = useState<LedgerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (page: number, append: boolean) => {
    if (append) setLoadingMore(true);
    setError("");
    try {
      const res = await fetch(`/api/account/ledger?page=${page}`, { method: "GET" });
      const json = (await res.json()) as { success?: boolean; data?: LedgerData; message?: string };
      if (res.status === 401) {
        setError(t("error"));
        if (!append) setData(null);
        return;
      }
      if (res.status === 200 && json.success && json.data) {
        const next = json.data;
        setData((prev) =>
          append && prev
            ? { ...next, entries: [...prev.entries, ...next.entries] }
            : next
        );
        return;
      }
      setError(json.message ?? t("error"));
    } catch {
      setError(t("error"));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [t]);

  useEffect(() => {
    void load(1, false);
  }, [load]);

  // Live: new entries (order placed, admin recorded a payment) refresh the
  // ledger silently; reconnects refetch the authoritative state.
  useRealtimeRefetch(["ledger.entry_created"], () => void load(1, false));

  function formatDate(iso: string | null) {
    if (!iso) return "—";
    try {
      return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
    } catch {
      return iso;
    }
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

      {loading ? (
        <ul className="ds-skeleton-list" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <li key={i} className="ds-skeleton-card">
              <span className="ds-skeleton ds-skeleton-line ds-skeleton-line--title" />
              <span className="ds-skeleton ds-skeleton-line ds-skeleton-line--wide" />
              <span className="ds-skeleton ds-skeleton-block" />
            </li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <div className="ds-mt-sm">
          <p className="ds-error">{error}</p>
          <button type="button" className="ds-btn ds-btn--secondary" onClick={() => void load(1, false)}>
            {t("retry")}
          </button>
        </div>
      ) : null}

      {!loading && data ? (
        <div className="ds-stack ds-content-after-title">
          <section className="ds-card ds-stack ds-stack--tight" aria-labelledby="ledger-summary-heading">
            <h2 id="ledger-summary-heading" className="ds-section-title">
              {t("sections.summary")}
            </h2>
            <p className="ds-text-small">
              <strong>{t("currentBalance")}:</strong>{" "}
              <span dir="ltr">{formatMinorUnits(locale, data.summary.currentBalanceMinor)}</span>
            </p>
            <p className="ds-text-caption">{t("balanceExplainer")}</p>
            <p className="ds-text-small">
              <strong>{t("lastEntryAt")}:</strong> {formatDate(data.summary.lastEntryAt)}
            </p>
          </section>

          <section className="ds-card ds-stack ds-stack--tight" aria-labelledby="ledger-entries-heading">
            <h2 id="ledger-entries-heading" className="ds-section-title">
              {t("sections.entries")}
            </h2>
            {data.entries.length === 0 ? (
              <p className="ds-text-muted">{t("empty")}</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="ds-ledger-table">
                  <thead>
                    <tr>
                      <th>{t("columns.date")}</th>
                      <th>{t("columns.type")}</th>
                      <th>{t("columns.reference")}</th>
                      <th>{t("columns.description")}</th>
                      <th>{t("columns.debit")}</th>
                      <th>{t("columns.credit")}</th>
                      <th>{t("columns.balance")}</th>
                      <th>{t("columns.status")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.entries.map((entry) => (
                      <tr key={entry.id}>
                        <td style={{ whiteSpace: "nowrap" }}>{formatDate(entry.createdAt)}</td>
                        <td>
                          <span className={typeBadgeClass(entry.type)}>{t(`types.${entry.type}`)}</span>
                        </td>
                        <td dir="ltr">
                          {entry.orderId ? (
                            <Link href={`/${locale}/dashboard/orders/${entry.orderId}`} className="ds-link">
                              #{shortOrderNumber(entry.orderId)}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>{entry.description}</td>
                        <td dir="ltr">{entry.debitMinor > 0 ? formatMinorUnits(locale, entry.debitMinor) : "—"}</td>
                        <td dir="ltr">{entry.creditMinor > 0 ? formatMinorUnits(locale, entry.creditMinor) : "—"}</td>
                        <td dir="ltr" style={{ fontWeight: 600 }}>
                          {formatMinorUnits(locale, entry.balanceAfterMinor)}
                        </td>
                        <td>{t(`status.${entry.status}`)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {data.hasMore ? (
              <button
                type="button"
                className="ds-btn ds-btn--secondary"
                disabled={loadingMore}
                onClick={() => void load(data.page + 1, true)}
              >
                {loadingMore ? t("loading") : t("loadMore")}
              </button>
            ) : null}
          </section>
        </div>
      ) : null}
    </main>
  );
}
