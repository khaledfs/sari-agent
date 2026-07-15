"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

type AdminOverview = {
  revenue: {
    today: { revenue: number; orderCount: number };
    last7d: { revenue: number; orderCount: number };
    last30d: { revenue: number; orderCount: number };
  };
  topProducts: Array<{ productId: string; name: string; quantity: number }>;
  ordersByStatus: Array<{ status: string; count: number }>;
  lowStock: Array<{ id: string; name: string; sku: string; stock: number; lowStockThreshold: number }>;
  newestCustomers: Array<{ id: string; businessName: string; phoneNumber: string; createdAt: string }>;
  weeklyRevenue: Array<{ weekStart: string; revenue: number }>;
};

const KNOWN_STATUSES = ["pending", "confirmed", "packed", "out_for_delivery", "delivered", "cancelled"] as const;

/** Pure-SVG sparkline — no charting library (transform-free, 8 points). */
function Sparkline({ points }: { points: number[] }) {
  const width = 280;
  const height = 64;
  const pad = 4;
  const max = Math.max(...points, 1);
  const step = points.length > 1 ? (width - pad * 2) / (points.length - 1) : 0;
  const coords = points.map((value, i) => {
    const x = pad + i * step;
    const y = height - pad - (value / max) * (height - pad * 2);
    return `${x},${Math.round(y * 10) / 10}`;
  });
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img" aria-hidden="true">
      <polyline
        points={coords.join(" ")}
        fill="none"
        stroke="var(--brand)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {coords.map((c, i) => {
        const [x, y] = c.split(",");
        return <circle key={i} cx={x} cy={y} r={i === coords.length - 1 ? 3.5 : 2} fill="var(--brand)" />;
      })}
    </svg>
  );
}

export default function AdminOverviewPage() {
  const t = useTranslations("adminDashboard");
  const locale = useLocale();
  const router = useRouter();

  const [data, setData] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/overview");
      if (res.status === 401) {
        router.replace(`/${locale}/admin/login`);
        return;
      }
      const json = (await res.json()) as { success?: boolean; data?: AdminOverview; message?: string };
      if (res.status === 200 && json.success && json.data) {
        setData(json.data);
        return;
      }
      setError(json.message ?? t("overview.error"));
    } catch {
      setError(t("overview.error"));
    } finally {
      setLoading(false);
    }
  }, [locale, router, t]);

  useEffect(() => {
    void load();
  }, [load]);

  function statusLabel(s: string) {
    return (KNOWN_STATUSES as readonly string[]).includes(s) ? t(`orders.status.${s}`) : s;
  }

  const maxStatusCount = Math.max(...(data?.ordersByStatus ?? []).map((s) => s.count), 1);

  return (
    <div>
      <Link href={`/${locale}/admin/dashboard`} className="admin-back-link">
        ← {t("hub.backToDashboard")}
      </Link>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "0.35rem" }}>📊 {t("overview.title")}</h1>
      <p style={{ color: "var(--text-muted)", marginBottom: "1.5rem" }}>{t("overview.subtitle")}</p>

      {error ? <p style={{ color: "var(--danger)", marginBottom: "1rem" }}>{error}</p> : null}

      {loading ? (
        <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "3rem 0" }}>
          {t("overview.loading")}
        </p>
      ) : data ? (
        <>
          <div className="admin-metric-grid">
            {(
              [
                ["today", data.revenue.today],
                ["last7d", data.revenue.last7d],
                ["last30d", data.revenue.last30d],
              ] as const
            ).map(([key, stats]) => (
              <div key={key} className="admin-metric-card">
                <span className="admin-metric-card__label">{t(`overview.periods.${key}`)}</span>
                <span className="admin-metric-card__value">₪{stats.revenue.toLocaleString(locale)}</span>
                <span className="admin-metric-card__sub">
                  {t("overview.orderCount", { count: stats.orderCount })}
                </span>
              </div>
            ))}
          </div>

          <div className="admin-overview-grid">
            <section className="admin-panel">
              <h2 className="admin-panel__title">{t("overview.weeklyRevenue")}</h2>
              {data.weeklyRevenue.every((w) => w.revenue === 0) ? (
                <p className="admin-panel__empty">{t("overview.noData")}</p>
              ) : (
                <>
                  <Sparkline points={data.weeklyRevenue.map((w) => w.revenue)} />
                  <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: "0.25rem 0 0" }}>
                    {t("overview.weeklyRevenueHint")}
                  </p>
                </>
              )}
            </section>

            <section className="admin-panel">
              <h2 className="admin-panel__title">{t("overview.ordersByStatus")}</h2>
              {data.ordersByStatus.length === 0 ? (
                <p className="admin-panel__empty">{t("overview.noData")}</p>
              ) : (
                <ul className="admin-status-bars">
                  {data.ordersByStatus.map((s) => (
                    <li key={s.status}>
                      <span className="admin-status-bars__label">{statusLabel(s.status)}</span>
                      <span className="admin-status-bars__track">
                        <span
                          className="admin-status-bars__fill"
                          style={{ inlineSize: `${Math.max(4, (s.count / maxStatusCount) * 100)}%` }}
                        />
                      </span>
                      <span className="admin-status-bars__count">{s.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="admin-panel">
              <h2 className="admin-panel__title">{t("overview.topProducts")}</h2>
              {data.topProducts.length === 0 ? (
                <p className="admin-panel__empty">{t("overview.noData")}</p>
              ) : (
                <ol className="admin-top-list">
                  {data.topProducts.map((p) => (
                    <li key={p.productId}>
                      <span className="admin-top-list__name">{p.name}</span>
                      <span className="admin-top-list__value">
                        {t("overview.unitsSold", { count: p.quantity })}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <section className="admin-panel">
              <h2 className="admin-panel__title">{t("overview.lowStock")}</h2>
              {data.lowStock.length === 0 ? (
                <p className="admin-panel__empty">{t("overview.noLowStock")}</p>
              ) : (
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>{t("products.columns.name")}</th>
                        <th>{t("products.columns.stock")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.lowStock.map((p) => (
                        <tr key={p.id}>
                          <td>
                            <Link href={`/${locale}/admin/dashboard/products`} className="admin-back-link" style={{ marginBottom: 0 }}>
                              {p.name}
                            </Link>
                            <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }} dir="ltr">
                              {p.sku}
                            </div>
                          </td>
                          <td>
                            <span
                              className={`admin-stock-badge ${p.stock === 0 ? "admin-stock-badge--out" : "admin-stock-badge--low"}`}
                            >
                              {p.stock === 0 ? t("products.outOfStock") : `${p.stock} / ${p.lowStockThreshold}`}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="admin-panel">
              <h2 className="admin-panel__title">{t("overview.newestCustomers")}</h2>
              {data.newestCustomers.length === 0 ? (
                <p className="admin-panel__empty">{t("overview.noData")}</p>
              ) : (
                <ul className="admin-top-list">
                  {data.newestCustomers.map((c) => (
                    <li key={c.id}>
                      <span className="admin-top-list__name">{c.businessName}</span>
                      <span className="admin-top-list__value" dir="ltr">
                        {c.phoneNumber}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}
