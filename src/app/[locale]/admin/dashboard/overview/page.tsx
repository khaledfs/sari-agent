"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

type Stats = {
  totalOrders: number;
  pendingOrders: number;
  totalProducts: number;
  activeProducts: number;
  totalCustomers: number;
};

export default function AdminOverviewPage() {
  const locale = useLocale();
  const t = useTranslations("adminDashboard");

  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [ordersRes, productsRes, customersRes] = await Promise.all([
          fetch("/api/admin/orders"),
          fetch("/api/admin/products"),
          fetch("/api/admin/customers"),
        ]);

        const [ordersJson, productsJson, customersJson] = await Promise.all([
          ordersRes.json() as Promise<{ success: boolean; data?: Array<{ status: string }> }>,
          productsRes.json() as Promise<{ success: boolean; data?: Array<{ isActive: boolean }> }>,
          customersRes.json() as Promise<{ success: boolean; data?: unknown[] }>,
        ]);

        const orders = ordersJson.success && ordersJson.data ? ordersJson.data : [];
        const products = productsJson.success && productsJson.data ? productsJson.data : [];
        const customers = customersJson.success && customersJson.data ? customersJson.data : [];

        setStats({
          totalOrders:    orders.length,
          pendingOrders:  orders.filter((o) => o.status === "pending").length,
          totalProducts:  products.length,
          activeProducts: products.filter((p) => p.isActive).length,
          totalCustomers: customers.length,
        });
      } catch {
        setError(t("overview.error"));
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [t]);

  const statCards: Array<{ key: keyof Stats; accent?: string }> = [
    { key: "totalOrders" },
    { key: "pendingOrders",  accent: "var(--warning)" },
    { key: "totalCustomers" },
    { key: "activeProducts", accent: "var(--success)" },
    { key: "totalProducts" },
  ];

  return (
    <div>
      <Link href={`/${locale}/admin/dashboard`} className="admin-back-link">
        ← {t("hub.backToDashboard")}
      </Link>

      <h1 style={{ fontSize: "1.5rem", marginBottom: "1.75rem", fontFamily: "var(--font-display, serif)" }}>
        {t("overview.title")}
      </h1>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "3rem 0" }}>
          <div className="admin-spinner" />
        </div>
      ) : error ? (
        <p style={{ color: "var(--danger)", textAlign: "center" }}>{error}</p>
      ) : stats ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "1rem" }}>
          {statCards.map(({ key, accent }) => (
            <div
              key={key}
              style={{
                padding: "1.25rem 1.1rem",
                borderRadius: "var(--radius-lg)",
                background: "var(--surface-2)",
                border: "1px solid var(--border-strong)",
                display: "flex",
                flexDirection: "column",
                gap: "0.35rem",
                position: "relative",
                overflow: "hidden",
                animation: "auth-card-enter 400ms cubic-bezier(0.2,0.9,0.25,1) both",
              }}
            >
              {/* Bottom accent bar */}
              <span style={{
                position: "absolute", insetBlockEnd: 0, insetInline: 0, height: "2px",
                background: `linear-gradient(90deg, ${accent ?? "var(--brand)"}, ${accent ?? "var(--brand-hover)"})`,
                opacity: 0.6,
              }} />
              <span style={{
                fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.06em",
                textTransform: "uppercase", color: "var(--text-muted)",
              }}>
                {t(`overview.stats.${key}`)}
              </span>
              <span style={{
                fontFamily: "var(--font-display, serif)",
                fontSize: "2.2rem", fontWeight: 600, lineHeight: 1.1,
                color: accent ?? "var(--text-primary)", letterSpacing: "-0.02em",
              }}>
                {stats[key]}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {/* Quick links */}
      {!loading && !error ? (
        <div style={{ marginTop: "2.5rem", display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
          {[
            { href: `/${locale}/admin/dashboard/orders`,   label: `→ ${t("hub.cards.orders")}` },
            { href: `/${locale}/admin/dashboard/products`, label: `→ ${t("hub.cards.products")}` },
            { href: `/${locale}/admin/dashboard/customers`,label: `→ ${t("hub.cards.customers")}` },
          ].map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              style={{
                padding: "0.5rem 1rem", borderRadius: "var(--radius-pill)",
                border: "1px solid var(--border-gold)",
                background: "rgba(200,144,47,0.07)",
                color: "var(--brand)", fontSize: "0.875rem", fontWeight: 600,
                textDecoration: "none", transition: "all 150ms ease",
              }}
            >
              {label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
