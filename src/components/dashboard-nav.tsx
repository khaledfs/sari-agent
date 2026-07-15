"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { CART_ADD_EVENT } from "@/components/living-bakery/micro";

type NavKey = "home" | "products" | "cart" | "orders" | "profile" | "ledger";

const routes: { segment: string; key: NavKey }[] = [
  { segment: "/dashboard", key: "home" },
  { segment: "/dashboard/products", key: "products" },
  { segment: "/dashboard/cart", key: "cart" },
  { segment: "/dashboard/orders", key: "orders" },
  { segment: "/dashboard/profile", key: "profile" },
  { segment: "/dashboard/ledger", key: "ledger" },
];

/** The five thumb-reachable tabs of the mobile bottom bar. */
const MOBILE_TABS: NavKey[] = ["home", "products", "cart", "orders", "profile"];

const NAV_ICONS: Record<NavKey, React.ReactNode> = {
  home: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  ),
  products: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
  ),
  cart: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
  ),
  orders: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  ),
  profile: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  ledger: null,
};

/**
 * Live cart item count for the badges. Fetched once on mount and refreshed on
 * the existing `sari:cart-add` event plus route changes (covers removals done
 * on the cart page itself).
 */
function useCartCount(): number {
  const [count, setCount] = useState(0);
  const pathname = usePathname();

  const fetchCount = useCallback(async (): Promise<number | null> => {
    try {
      const res = await fetch("/api/cart");
      if (res.status !== 200) return null;
      const json = (await res.json()) as {
        success?: boolean;
        data?: { items?: Array<{ quantity: number }> };
      };
      if (json.success && json.data?.items) {
        return json.data.items.reduce(
          (n, i) => n + (Number.isFinite(i.quantity) ? i.quantity : 0),
          0
        );
      }
      return null;
    } catch {
      return null; // badge is decorative — fail silent
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next = await fetchCount();
      if (!cancelled && next !== null) setCount(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchCount, pathname]);

  useEffect(() => {
    let cancelled = false;
    const onAdd = () => {
      void fetchCount().then((next) => {
        if (!cancelled && next !== null) setCount(next);
      });
    };
    window.addEventListener(CART_ADD_EVENT, onAdd);
    return () => {
      cancelled = true;
      window.removeEventListener(CART_ADD_EVENT, onAdd);
    };
  }, [fetchCount]);

  return count;
}

function CartBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="ds-cart-badge" aria-hidden="true">
      {count > 99 ? "99+" : count}
    </span>
  );
}

/** Mobile-only cart shortcut for the top header (hidden on desktop via CSS). */
export function HeaderCartLink() {
  const t = useTranslations("dashboard.nav");
  const locale = useLocale();
  const count = useCartCount();
  return (
    <Link
      href={`/${locale}/dashboard/cart`}
      className="ds-header-cart"
      aria-label={`${t("cart")}${count > 0 ? ` (${count})` : ""}`}
    >
      {NAV_ICONS.cart}
      <CartBadge count={count} />
    </Link>
  );
}

export function DashboardNav() {
  const t = useTranslations("dashboard.nav");
  const locale = useLocale();
  const pathname = usePathname();
  const cartCount = useCartCount();

  function isActive(href: string) {
    const isHome = href.endsWith("/dashboard");
    if (isHome) {
      return pathname === `/${locale}/dashboard` || pathname === `/${locale}/dashboard/`;
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <>
      {/* Desktop / tablet: the existing horizontal tabs (hidden ≤768px). */}
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

      {/* Mobile: fixed bottom tab bar (hidden >768px). */}
      <nav className="ds-bottom-nav" aria-label="Dashboard">
        {MOBILE_TABS.map((key) => {
          const segment = routes.find((r) => r.key === key)?.segment ?? "/dashboard";
          const href = `/${locale}${segment}`;
          const active = isActive(href);
          return (
            <Link
              key={key}
              href={href}
              className={`ds-bottom-nav__tab${active ? " ds-bottom-nav__tab--active" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              <span className="ds-bottom-nav__icon">
                {NAV_ICONS[key]}
                {key === "cart" ? <CartBadge count={cartCount} /> : null}
              </span>
              <span className="ds-bottom-nav__label">{t(key)}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
