"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

type HubLink = {
  href: string;
  navKey: "products" | "cart" | "orders" | "profile" | "invoices";
};

export default function DashboardPage() {
  const t = useTranslations("dashboard");
  const tNav = useTranslations("dashboard.nav");
  const router = useRouter();
  const locale = useLocale();

  const hubLinks: HubLink[] = [
    { href: `/${locale}/dashboard/products`, navKey: "products" },
    { href: `/${locale}/dashboard/cart`, navKey: "cart" },
    { href: `/${locale}/dashboard/orders`, navKey: "orders" },
    { href: `/${locale}/dashboard/profile`, navKey: "profile" },
    { href: `/${locale}/dashboard/invoices`, navKey: "invoices" },
  ];

  async function logout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore
    }
    try {
      localStorage.removeItem("authToken");
    } catch {
      // ignore
    }
    router.replace(`/${locale}/login`);
  }

  return (
    <main className="ds-page">
      <header className="ds-page-header">
        <h1 className="ds-page-title">{t("hub.title")}</h1>
        <p className="ds-page-subtitle">{t("hub.subtitle")}</p>
      </header>

      <div className="ds-hub-grid">
        {hubLinks.map((item) => (
          <Link key={item.href} href={item.href} className="ds-hub-card">
            {tNav(item.navKey)}
          </Link>
        ))}
      </div>

      <div className="ds-logout-wrap">
        <button type="button" className="ds-btn ds-btn--secondary ds-btn--block" onClick={logout}>
          {t("actions.logout")}
        </button>
      </div>
    </main>
  );
}
