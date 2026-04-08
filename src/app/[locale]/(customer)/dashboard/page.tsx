"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

const ProductsIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
);

const CartIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="21" r="1" />
    <circle cx="20" cy="21" r="1" />
    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
  </svg>
);

const OrdersIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
);

const ProfileIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const LedgerIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    <line x1="8" y1="7" x2="16" y2="7" />
    <line x1="8" y1="11" x2="16" y2="11" />
    <line x1="8" y1="15" x2="14" y2="15" />
  </svg>
);

type HubItem = {
  href: string;
  navKey: "products" | "cart" | "orders" | "profile" | "ledger";
  icon: React.FC;
};

export default function DashboardPage() {
  const t = useTranslations("dashboard");
  const tNav = useTranslations("dashboard.nav");
  const router = useRouter();
  const locale = useLocale();

  const hubItems: HubItem[] = [
    { href: `/${locale}/dashboard/products`, navKey: "products", icon: ProductsIcon },
    { href: `/${locale}/dashboard/cart`, navKey: "cart", icon: CartIcon },
    { href: `/${locale}/dashboard/orders`, navKey: "orders", icon: OrdersIcon },
    { href: `/${locale}/dashboard/profile`, navKey: "profile", icon: ProfileIcon },
    { href: `/${locale}/dashboard/ledger`, navKey: "ledger", icon: LedgerIcon },
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
      <div className="ds-welcome-banner">
        <h1 className="ds-welcome-title">{t("hub.welcome")}</h1>
        <p className="ds-welcome-subtitle">{t("hub.welcomeSubtitle")}</p>
      </div>

      <div className="ds-hub-grid">
        {hubItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} className="ds-hub-card">
              <span className="ds-hub-icon"><Icon /></span>
              <span className="ds-hub-label">{tNav(item.navKey)}</span>
              <span className="ds-hub-desc">{t(`hub.desc.${item.navKey}`)}</span>
            </Link>
          );
        })}
      </div>

      <div className="ds-logout-wrap">
        <button type="button" className="ds-btn ds-btn--secondary" onClick={logout}>
          {t("actions.logout")}
        </button>
      </div>
    </main>
  );
}
