"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

import { useConsoleAuth } from "./admin-auth-context";

/**
 * Task D: agents reuse this console with scope applied server-side; the nav
 * only HIDES admin-only surfaces (catalog management, banners, settings,
 * agent management) — hiding is UX, the server enforces regardless.
 */
const CARDS = [
  { key: "overview", icon: "📊", href: "/admin/dashboard/overview", adminOnly: false },
  { key: "customers", icon: "👥", href: "/admin/dashboard/customers", adminOnly: false },
  { key: "orders", icon: "📦", href: "/admin/dashboard/orders", adminOnly: false },
  { key: "collections", icon: "💵", href: "/admin/dashboard/collections", adminOnly: false },
  { key: "messages", icon: "💬", href: "/admin/dashboard/messages", adminOnly: false },
  { key: "products", icon: "🏷️", href: "/admin/dashboard/products", adminOnly: true },
  { key: "discounts", icon: "💰", href: "/admin/dashboard/discounts", adminOnly: false },
  { key: "promotions", icon: "🎁", href: "/admin/dashboard/promotions", adminOnly: false },
  { key: "banners", icon: "📣", href: "/admin/dashboard/banners", adminOnly: true },
  { key: "reports", icon: "📈", href: "/admin/dashboard/reports", adminOnly: false },
  { key: "agents", icon: "🧭", href: "/admin/dashboard/agents", adminOnly: true },
  { key: "settings", icon: "⚙️", href: "/admin/dashboard/settings", adminOnly: true },
] as const;

export default function AdminDashboardPage() {
  const locale = useLocale();
  const t = useTranslations("adminDashboard");
  const { role } = useConsoleAuth();

  const visible = CARDS.filter((card) => !card.adminOnly || role === "admin");

  return (
    <div>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "0.35rem", textAlign: "center" }}>
        {t("hub.title")}
      </h1>
      <p style={{ color: "var(--text-muted)", marginBottom: "2rem", textAlign: "center", fontSize: "0.9375rem" }}>
        {t("hub.subtitle")}
      </p>

      <div className="admin-card-grid">
        {visible.map(({ key, icon, href }) => (
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
