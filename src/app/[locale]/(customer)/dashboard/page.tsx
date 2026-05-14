"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { typography } from "@/design/typography";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useViewportMode } from "@/lib/use-viewport";

// ========== Icons ==========

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

const ArrowIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </svg>
);

const ZapIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);

const SparklesIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
    <path d="M5 3v4" />
    <path d="M19 17v4" />
    <path d="M3 5h4" />
    <path d="M17 19h4" />
  </svg>
);

const ListChecksIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 17l2 2l4-4" />
    <path d="M3 7l2 2l4-4" />
    <path d="M13 7h8" />
    <path d="M13 17h8" />
  </svg>
);

const PackageIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="16.5" y1="9.4" x2="7.5" y2="4.21" />
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
);

const TruckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
    <path d="M15 18H9" />
    <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14" />
    <circle cx="17" cy="18" r="2" />
    <circle cx="7" cy="18" r="2" />
  </svg>
);

const HeadsetIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 11h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5Zm0 0a9 9 0 1 1 18 0m0 0v5a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3Z" />
    <path d="M21 16v2a4 4 0 0 1-4 4h-5" />
  </svg>
);

const WhatsAppIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" strokeWidth="0">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
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
  const tLanding = useTranslations("dashboard.landing");
  const router = useRouter();
  const locale = useLocale();
  const viewportMode = useViewportMode();

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

  // ========== Desktop Landing ==========
  if (viewportMode === "desktop") {
    return (
      <main className="ds-page ds-page--landing">
        {/* Hero Section */}
        <section className="ds-home-hero">
          <div className="ds-home-hero__content">
            <span className="ds-home-hero__eyebrow">SARI</span>
            <h1 className={`ds-home-hero__title ${typography.h2}`}>{t("hub.welcome")}</h1>
            <p className={`ds-home-hero__subtitle ${typography.body}`}>{t("hub.welcomeSubtitle")}</p>
          </div>

          <div className="ds-home-hero__glow" aria-hidden="true" />
        </section>

        {/* Features Section */}
        <section className="ds-landing-section">
          <h2 className="ds-section-title ds-landing-section__title">{tLanding("features.title")}</h2>

          <div className="ds-landing-features">
            <div className="ds-feature-card">
              <div className="ds-feature-card__icon">
                <ZapIcon />
              </div>
              <h3 className="ds-feature-card__title">{tLanding("features.speed.title")}</h3>
              <p className="ds-feature-card__desc">{tLanding("features.speed.description")}</p>
            </div>

            <div className="ds-feature-card">
              <div className="ds-feature-card__icon">
                <SparklesIcon />
              </div>
              <h3 className="ds-feature-card__title">{tLanding("features.ai.title")}</h3>
              <p className="ds-feature-card__desc">{tLanding("features.ai.description")}</p>
            </div>

            <div className="ds-feature-card">
              <div className="ds-feature-card__icon">
                <ListChecksIcon />
              </div>
              <h3 className="ds-feature-card__title">{tLanding("features.tracking.title")}</h3>
              <p className="ds-feature-card__desc">{tLanding("features.tracking.description")}</p>
            </div>
          </div>
        </section>

        {/* Quick Actions Section */}
        <section className="ds-landing-section">
          <h2 className="ds-section-title ds-landing-section__title">{tLanding("actions.title")}</h2>

          <div className="ds-landing-actions">
            {hubItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.href} href={item.href} className="ds-action-btn ds-action-btn--large">
                  <div className="ds-action-btn__icon">
                    <Icon />
                  </div>
                  <span className="ds-action-btn__label">{tNav(item.navKey)}</span>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Trust Section */}
        <section className="ds-landing-section">
          <div className="ds-trust-grid">
            <div className="ds-trust-card">
              <div className="ds-trust-card__icon">
                <PackageIcon />
              </div>
              <div>
                <h3 className="ds-trust-card__title">{tLanding("trust.catalog.title")}</h3>
                <p className="ds-trust-card__desc">{tLanding("trust.catalog.description")}</p>
              </div>
            </div>

            <div className="ds-trust-card">
              <div className="ds-trust-card__icon">
                <TruckIcon />
              </div>
              <div>
                <h3 className="ds-trust-card__title">{tLanding("trust.delivery.title")}</h3>
                <p className="ds-trust-card__desc">{tLanding("trust.delivery.description")}</p>
              </div>
            </div>

            <div className="ds-trust-card">
              <div className="ds-trust-card__icon">
                <HeadsetIcon />
              </div>
              <div>
                <h3 className="ds-trust-card__title">{tLanding("trust.support.title")}</h3>
                <p className="ds-trust-card__desc">{tLanding("trust.support.description")}</p>
              </div>
            </div>
          </div>
        </section>

        {/* Footer Section */}
        <section className="ds-landing-footer">
          <div className="ds-landing-footer__links">
            <Link href={`/${locale}/dashboard/profile`} className="ds-link">
              {tLanding("footer.help")}
            </Link>
            <Link href={`/${locale}/dashboard/ledger`} className="ds-link">
              {tLanding("footer.viewLedger")}
            </Link>
            <Link href={`/${locale}/dashboard/profile`} className="ds-link">
              {tLanding("footer.settings")}
            </Link>
          </div>
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
            <a
              href="https://wa.me/972501234567"
              target="_blank"
              rel="noopener noreferrer"
              className="ds-btn ds-btn--whatsapp"
            >
              <WhatsAppIcon />
              WhatsApp
            </a>
            <Button variant="secondary" onClick={logout}>
              {t("actions.logout")}
            </Button>
          </div>
        </section>
      </main>
    );
  }

  // ========== Mobile Hub Grid ==========
  return (
    <main className="ds-page ds-page--dashboard-home">
      <section className="ds-home-hero">
        <div className="ds-home-hero__content">
          <span className="ds-home-hero__eyebrow">SARI</span>
          <h1 className={`ds-home-hero__title ${typography.h2}`}>{t("hub.welcome")}</h1>
          <p className={`ds-home-hero__subtitle ${typography.body}`}>{t("hub.welcomeSubtitle")}</p>
        </div>

        <div className="ds-home-hero__glow" aria-hidden="true" />
      </section>

      <section className="ds-home-section">
        <div className="ds-home-section__head">
          <h2 className="ds-section-title">{t("hub.quickNav")}</h2>
          <p className="ds-page-subtitle">{t("hub.quickNavSubtitle")}</p>
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

      <section className="ds-home-footer-actions">
        <a
          href="https://wa.me/972501234567"
          target="_blank"
          rel="noopener noreferrer"
          className="ds-btn ds-btn--whatsapp"
        >
          <WhatsAppIcon />
          WhatsApp
        </a>
        <Button variant="secondary" onClick={logout}>
          {t("actions.logout")}
        </Button>
      </section>
    </main>
  );
}
