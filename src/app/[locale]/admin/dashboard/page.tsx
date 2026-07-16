"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

const CARDS = [
  { key: "overview", icon: "📊", href: "/admin/dashboard/overview" },
  { key: "customers", icon: "👥", href: "/admin/dashboard/customers" },
  { key: "orders", icon: "📦", href: "/admin/dashboard/orders" },
  { key: "products", icon: "🏷️", href: "/admin/dashboard/products" },
  { key: "discounts", icon: "💰", href: "/admin/dashboard/discounts" },
  { key: "promotions", icon: "🎁", href: "/admin/dashboard/promotions" },
  { key: "banners", icon: "📣", href: "/admin/dashboard/banners" },
  { key: "reports", icon: "📈", href: "/admin/dashboard/reports" },
  { key: "settings", icon: "⚙️", href: "/admin/dashboard/settings" },
] as const;

export default function AdminDashboardPage() {
  const locale = useLocale();
  const t = useTranslations("adminDashboard");

  return (
    <div>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "0.35rem", textAlign: "center" }}>
        {t("hub.title")}
      </h1>
      <p style={{ color: "var(--text-muted)", marginBottom: "2rem", textAlign: "center", fontSize: "0.9375rem" }}>
        {t("hub.subtitle")}
      </p>

      <div className="admin-card-grid">
        {CARDS.map(({ key, icon, href }) => (
          <Link key={key} href={`/${locale}${href}`} className="admin-card">
            <span className="admin-card-icon">{icon}</span>
            <div className="admin-card-text">
              <span className="admin-card-title">{t(`hub.cards.${key}`)}</span>
              <span className="admin-card-desc">{t(`hub.cards.${key}Desc`)}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
