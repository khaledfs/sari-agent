"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

type NavKey = "home" | "products" | "cart" | "orders" | "profile" | "invoices";

const routes: { segment: string; key: NavKey }[] = [
  { segment: "/dashboard", key: "home" },
  { segment: "/dashboard/products", key: "products" },
  { segment: "/dashboard/cart", key: "cart" },
  { segment: "/dashboard/orders", key: "orders" },
  { segment: "/dashboard/profile", key: "profile" },
  { segment: "/dashboard/invoices", key: "invoices" },
];

export function DashboardNav() {
  const t = useTranslations("dashboard.nav");
  const locale = useLocale();
  const pathname = usePathname();

  function isActive(href: string) {
    const isHome = href.endsWith("/dashboard");
    if (isHome) {
      return pathname === `/${locale}/dashboard` || pathname === `/${locale}/dashboard/`;
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <nav className="ds-nav-tabs" aria-label="Dashboard">
      {routes.map(({ segment, key }) => {
        const href = `/${locale}${segment}`;
        const active = isActive(href);
        return (
          <Link key={segment} href={href} className={`ds-tab${active ? " ds-tab--active" : ""}`}>
            {t(key)}
          </Link>
        );
      })}
    </nav>
  );
}
