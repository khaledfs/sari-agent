"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

type ReportType = "orders" | "top-products" | "customer-sales";
type Row = Record<string, string | number>;
type ApiEnvelope = {
  success?: boolean;
  data?: Row[];
  meta?: { count: number; hasMore?: boolean };
  message?: string;
};

const TABS: ReportType[] = ["orders", "top-products", "customer-sales"];

const COLUMNS: Record<ReportType, string[]> = {
  orders: ["orderNumber", "date", "customerName", "itemCount", "subtotal", "discount", "total", "status"],
  "top-products": ["name", "sku", "category", "totalQty", "totalRevenue", "orderCount"],
  "customer-sales": ["customerName", "businessType", "phone", "orderCount", "totalSpend", "avgOrderValue", "lastOrderDate"],
};

/** Columns summed in the totals row. */
const TOTAL_COLUMNS: Record<ReportType, string[]> = {
  orders: ["itemCount", "subtotal", "discount", "total"],
  "top-products": ["totalQty", "totalRevenue", "orderCount"],
  "customer-sales": ["orderCount", "totalSpend"],
};

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export default function AdminReportsPage() {
  const t = useTranslations("adminDashboard");
  const locale = useLocale();
  const router = useRouter();

  const [tab, setTab] = useState<ReportType>("orders");
  const [from, setFrom] = useState(isoDaysAgo(30));
  const [to, setTo] = useState(isoDaysAgo(0));
  const [rows, setRows] = useState<Row[]>([]);
  const [count, setCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const rangeValid = Boolean(from && to && from <= to);

  const load = useCallback(async () => {
    if (!rangeValid) {
      setError(t("reports.invalidRange"));
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/reports/${tab}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from: new Date(`${from}T00:00:00`).toISOString(),
          to: new Date(`${to}T23:59:59`).toISOString(),
        }),
      });
      if (res.status === 401) {
        router.replace(`/${locale}/admin/login`);
        return;
      }
      const json = (await res.json()) as ApiEnvelope;
      if (res.status === 200 && json.success && json.data) {
        setRows(json.data);
        setCount(json.meta?.count ?? json.data.length);
        setHasMore(Boolean(json.meta?.hasMore));
        return;
      }
      setError(json.message ?? t("reports.error"));
    } catch {
      setError(t("reports.error"));
    } finally {
      setLoading(false);
    }
  }, [tab, from, to, rangeValid, locale, router, t]);

  useEffect(() => {
    void load();
  }, [load]);

  function formatCell(column: string, value: string | number): string {
    if (typeof value === "number") return value.toLocaleString(locale);
    if ((column === "date" || column === "lastOrderDate") && value) {
      try {
        return new Date(value).toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
      } catch {
        return String(value);
      }
    }
    return String(value);
  }

  const columns = COLUMNS[tab];
  const totalColumns = TOTAL_COLUMNS[tab];
  const preview = rows.slice(0, 10);
  const totals = new Map<string, number>();
  for (const column of totalColumns) {
    totals.set(
      column,
      Math.round(rows.reduce((n, r) => n + (typeof r[column] === "number" ? (r[column] as number) : 0), 0) * 100) / 100
    );
  }

  const exportHref = `/api/admin/reports/${tab}/export?${new URLSearchParams({
    from: rangeValid ? new Date(`${from}T00:00:00`).toISOString() : "",
    to: rangeValid ? new Date(`${to}T23:59:59`).toISOString() : "",
    format: "csv",
  }).toString()}`;

  return (
    <div>
      <Link href={`/${locale}/admin/dashboard`} className="admin-back-link">
        ← {t("hub.backToDashboard")}
      </Link>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "0.35rem" }}>{t("reports.title")}</h1>
      <p style={{ color: "var(--text-muted)", marginBottom: "1.25rem" }}>{t("reports.subtitle")}</p>

      <div className="admin-crm-tabs" role="tablist" aria-label={t("reports.title")}>
        {TABS.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={`admin-btn${tab === key ? " admin-crm-tab--active" : ""}`}
            onClick={() => setTab(key)}
          >
            {t(`reports.tabs.${key}`)}
          </button>
        ))}
      </div>

      <div className="admin-toolbar">
        <label className="admin-field" style={{ marginBottom: 0 }}>
          <span>{t("discounts.form.startsAt")}</span>
          <input className="admin-input" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="admin-field" style={{ marginBottom: 0 }}>
          <span>{t("discounts.form.endsAt")}</span>
          <input className="admin-input" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </label>
        <a
          className="admin-btn-primary"
          style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}
          href={rangeValid && rows.length > 0 ? exportHref : undefined}
          aria-disabled={!rangeValid || rows.length === 0}
          download
        >
          ⬇ {t("reports.exportCsv")}
        </a>
      </div>

      {error ? <p style={{ color: "var(--danger)", marginBottom: "1rem" }}>{error}</p> : null}

      {loading ? (
        <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "3rem 0" }}>{t("reports.loading")}</p>
      ) : rows.length === 0 ? (
        <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "3rem 0" }}>{t("reports.empty")}</p>
      ) : (
        <>
          <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
            {t("reports.rowCount", { count })}
            {hasMore ? ` · ${t("reports.hasMore")}` : ""}
            {rows.length > 10 ? ` · ${t("reports.previewNote")}` : ""}
          </p>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th key={column}>{t(`reports.columns.${column}`)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((row, i) => (
                  <tr key={i}>
                    {columns.map((column) => (
                      <td key={column} style={{ whiteSpace: "nowrap", maxWidth: "220px", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {formatCell(column, row[column] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr style={{ fontWeight: 700, background: "var(--brand-bg)" }}>
                  {columns.map((column, i) => (
                    <td key={column}>
                      {i === 0 ? t("reports.totalsRow") : totals.has(column) ? totals.get(column)?.toLocaleString(locale) : ""}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
