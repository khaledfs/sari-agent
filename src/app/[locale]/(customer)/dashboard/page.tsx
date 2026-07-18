"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { typography } from "@/design/typography";
import { useAccountStatus } from "@/components/account-status/account-status-provider";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { emitCartAdd } from "@/components/living-bakery/micro";

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

const MessagesIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
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

const ArrowIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </svg>
);

const TruckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="3" width="15" height="13" />
    <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
    <circle cx="5.5" cy="18.5" r="2.5" />
    <circle cx="18.5" cy="18.5" r="2.5" />
  </svg>
);

const TagIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
    <line x1="7" y1="7" x2="7.01" y2="7" />
  </svg>
);

const SparkIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
  </svg>
);

const HeartIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 1 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z" />
  </svg>
);

const BoxIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
);

type HubItem = {
  href: string;
  navKey: "products" | "cart" | "orders" | "messages" | "profile" | "ledger";
  icon: React.FC;
};

type SpotlightProduct = {
  _id: string;
  name: string;
  price: number;
  unit?: string;
  imageUrl?: string;
};

/** Animated count-up number. Respects reduced-motion. */
function CountUp({ value, duration = 900 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<number | null>(null);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    // All state updates happen inside rAF callbacks (external-system driven),
    // never synchronously in the effect body.
    if (reduce || value <= 0) {
      ref.current = requestAnimationFrame(() => setDisplay(value));
      return () => {
        if (ref.current) cancelAnimationFrame(ref.current);
      };
    }

    let start: number | null = null;
    const tick = (now: number) => {
      if (start === null) start = now;
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setDisplay(Math.round(eased * value));
      if (p < 1) ref.current = requestAnimationFrame(tick);
    };
    ref.current = requestAnimationFrame(tick);
    return () => {
      if (ref.current) cancelAnimationFrame(ref.current);
    };
  }, [value, duration]);

  return <>{display.toLocaleString()}</>;
}

export default function DashboardPage() {
  const t = useTranslations("dashboard");
  const tHome = useTranslations("dashboard.home");
  const tNav = useTranslations("dashboard.nav");
  const tSmart = useTranslations("smartOrdering");
  const tRestricted = useTranslations("restricted");
  const { restricted, notifyRestricted } = useAccountStatus();
  const router = useRouter();
  const locale = useLocale();

  const [stats, setStats] = useState({ orders: 0, favorites: 0, catalog: 0 });
  const [spotlight, setSpotlight] = useState<SpotlightProduct[]>([]);
  const [addedId, setAddedId] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const addedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hubItems: HubItem[] = [
    { href: `/${locale}/dashboard/products`, navKey: "products", icon: ProductsIcon },
    { href: `/${locale}/dashboard/cart`, navKey: "cart", icon: CartIcon },
    { href: `/${locale}/dashboard/orders`, navKey: "orders", icon: OrdersIcon },
    { href: `/${locale}/dashboard/messages`, navKey: "messages", icon: MessagesIcon },
    { href: `/${locale}/dashboard/profile`, navKey: "profile", icon: ProfileIcon },
    { href: `/${locale}/dashboard/ledger`, navKey: "ledger", icon: LedgerIcon },
  ];

  // Load engagement stats + spotlight from existing APIs; fail soft.
  useEffect(() => {
    let cancelled = false;

    const num = (json: unknown): number => {
      const data = (json as { data?: unknown })?.data;
      return Array.isArray(data) ? data.length : 0;
    };
    // The catalog endpoint is PAGINATED — its `data` is one page (≤50). The true
    // catalog size is `meta.total` (active products); fall back to the page length.
    const total = (json: unknown): number => {
      const metaTotal = (json as { meta?: { total?: unknown } })?.meta?.total;
      return typeof metaTotal === "number" ? metaTotal : num(json);
    };

    (async () => {
      const safe = async (url: string) => {
        try {
          const res = await fetch(url, { method: "GET" });
          if (!res.ok) return null;
          return (await res.json()) as unknown;
        } catch {
          return null;
        }
      };

      const [ordersJson, favJson, prodJson, freqJson] = await Promise.all([
        safe("/api/orders"),
        safe("/api/favorites"),
        safe("/api/products"),
        safe("/api/smart-ordering/frequent"),
      ]);

      if (cancelled) return;

      setStats({
        orders: num(ordersJson),
        favorites: num(favJson),
        catalog: total(prodJson),
      });

      const freqData = (freqJson as { data?: SpotlightProduct[] })?.data;
      if (Array.isArray(freqData) && freqData.length > 0) {
        setSpotlight(freqData.slice(0, 8));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (addedTimer.current) clearTimeout(addedTimer.current);
    };
  }, []);

  async function addToCart(productId: string) {
    setAddingId(productId);
    try {
      const res = await fetch("/api/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, quantity: 1 }),
      });
      const json = (await res.json()) as { success?: boolean; code?: string };
      if (res.status === 403 && json.code === "ACCOUNT_RESTRICTED") {
        notifyRestricted();
        return;
      }
      if (res.ok && json.success) {
        if (addedTimer.current) clearTimeout(addedTimer.current);
        setAddedId(productId);
        emitCartAdd();
        addedTimer.current = setTimeout(() => setAddedId(null), 2200);
      }
    } catch {
      // fail soft
    } finally {
      setAddingId(null);
    }
  }

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

  const statCards = [
    { key: "orders", value: stats.orders, label: tHome("statsOrders"), icon: <OrdersIcon /> },
    { key: "favorites", value: stats.favorites, label: tHome("statsFavorites"), icon: <HeartIcon /> },
    { key: "catalog", value: stats.catalog, label: tHome("statsCatalog"), icon: <BoxIcon /> },
  ];

  const benefits = [
    { icon: <TruckIcon />, title: tHome("benefit1Title"), desc: tHome("benefit1Desc") },
    { icon: <TagIcon />, title: tHome("benefit2Title"), desc: tHome("benefit2Desc") },
    { icon: <SparkIcon />, title: tHome("benefit3Title"), desc: tHome("benefit3Desc") },
  ];

  return (
    <main className="ds-page ds-page--dashboard-home">
      <section className="ds-home-hero">
        <div className="ds-home-hero__content">
          <span className="ds-home-hero__eyebrow">{tHome("eyebrow")}</span>
          <h1 className={`ds-home-hero__title ${typography.h2}`}>{t("hub.welcome")}</h1>
          <p className={`ds-home-hero__subtitle ${typography.body}`}>{t("hub.welcomeSubtitle")}</p>

          <div className="ds-home-hero__actions">
            <Link href={`/${locale}/dashboard/products`}>
              <Button variant="primary">{tNav("products")}</Button>
            </Link>
            <Link href={`/${locale}/dashboard/cart`}>
              <Button variant="secondary">{tNav("cart")}</Button>
            </Link>
          </div>
        </div>

        <div className="ds-home-hero__glow" aria-hidden="true" />
      </section>

      <section className="ds-sari-stats" aria-label={tHome("quickNav")}>
        {statCards.map((s) => (
          <div key={s.key} className="ds-sari-stat">
            <span className="ds-sari-stat__icon" aria-hidden="true">
              {s.icon}
            </span>
            <div className="ds-sari-stat__value">
              <CountUp value={s.value} />
            </div>
            <div className="ds-sari-stat__label">{s.label}</div>
          </div>
        ))}
      </section>

      <section className="ds-sari-spotlight">
        <div className="ds-sari-spotlight__head">
          <span className="ds-sari-spotlight__badge">
            <SparkIcon />
            {tHome("spotlightBadge")}
          </span>
          <h2 className="ds-sari-spotlight__title">{tHome("spotlightTitle")}</h2>
        </div>

        {spotlight.length > 0 ? (
          <ul className="ds-sari-reorder-strip">
            {spotlight.map((p) => {
              const done = addedId === p._id;
              const busy = addingId === p._id;
              return (
                <li key={p._id} className="ds-sari-reorder-item">
                  <div className="ds-sari-reorder-thumb">
                    {p.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="ds-sari-reorder-fallback" />
                    )}
                  </div>
                  <p className="ds-sari-reorder-name">{p.name}</p>
                  <p className="ds-sari-reorder-price">
                    ₪ {p.price} {p.unit ? `/ ${p.unit}` : ""}
                  </p>
                  <button
                    type="button"
                    className={`ds-sari-reorder-btn${done ? " ds-sari-reorder-btn--done" : ""}`}
                    disabled={busy || done || restricted}
                    title={restricted ? tRestricted("actionBlocked") : undefined}
                    onClick={() => void addToCart(p._id)}
                  >
                    {done ? tHome("added") : busy ? tSmart("reordering") : tSmart("reorder")}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="ds-text-muted">{tHome("spotlightEmpty")}</p>
        )}
      </section>

      <section className="ds-home-section">
        <div className="ds-home-section__head">
          <span className="ds-sari-eyebrow">{tHome("eyebrow")}</span>
          <h2 className="ds-section-title">{tHome("quickNav")}</h2>
          <p className="ds-page-subtitle">{tHome("quickNavSub")}</p>
        </div>

        <div className="ds-hub-grid ds-hub-grid--premium">
          {hubItems.map((item) => {
            const Icon = item.icon;
            return (
              <Card key={item.href} as={Link} href={item.href} clickable className="ds-hub-card ds-hub-card--premium">
                <div className="ds-hub-card__top">
                  <span className="ds-hub-icon ds-hub-icon--premium">
                    <Icon />
                  </span>
                  <span className="ds-hub-arrow" aria-hidden="true">
                    <ArrowIcon />
                  </span>
                </div>

                <div className="ds-hub-card__body">
                  <span className={`ds-hub-label ${typography.h3}`}>{tNav(item.navKey)}</span>
                  <span className={`ds-hub-desc ${typography.small}`}>{t(`hub.desc.${item.navKey}`)}</span>
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="ds-home-section">
        <div className="ds-home-section__head">
          <h2 className="ds-section-title">{tHome("benefitsTitle")}</h2>
        </div>
        <div className="ds-sari-benefits">
          {benefits.map((b, i) => (
            <div key={i} className="ds-sari-benefit">
              <span className="ds-sari-benefit__icon" aria-hidden="true">
                {b.icon}
              </span>
              <div>
                <p className="ds-sari-benefit__title">{b.title}</p>
                <p className="ds-sari-benefit__desc">{b.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="ds-home-footer-actions">
        <Button variant="secondary" onClick={logout}>
          {t("actions.logout")}
        </Button>
      </section>
    </main>
  );
}
