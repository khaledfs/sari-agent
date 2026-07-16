"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Image from "next/image";

import { AIAssistant } from "@/components/ai-assistant";
import { BannerStrip } from "@/components/banner-strip";
import { DashboardNav, HeaderCartLink } from "@/components/dashboard-nav";
import { RealtimeProvider } from "@/components/realtime/realtime-provider";
import { SceneStage } from "@/components/living-bakery/SceneStage";
import { CartDropLayer, FlourDrift } from "@/components/living-bakery/micro";

import "./dashboard-ui.css";
import "./sari-enhance.css";
import "./ambience.css";

type Phase = "checking" | "allowed" | "denied";

/**
 * Blocks all dashboard routes until session is verified server-side via /api/auth/session.
 * Prevents a flash of cart/products content before redirect when logged out.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const router = useRouter();
  const t = useTranslations("dashboard");
  const locale = typeof params.locale === "string" ? params.locale : "en";
  const [phase, setPhase] = useState<Phase>("checking");
  const didPrefetch = useRef(false);

  // Session verification: runs once per locale/route change
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/session", { method: "GET" });
        const json = (await res.json()) as {
          data?: { authenticated?: boolean };
        };
        if (cancelled) return;
        if (json.data?.authenticated !== true) {
          setPhase("denied");
          router.replace(`/${locale}/login`);
          return;
        }
        setPhase("allowed");
      } catch {
        if (cancelled) return;
        setPhase("denied");
        router.replace(`/${locale}/login`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [locale, router]);

  useEffect(() => {
    if (phase !== "allowed" || didPrefetch.current) return;
    didPrefetch.current = true;
    const prefix = `/${locale}/dashboard`;
    const paths = [
      prefix,
      `${prefix}/products`,
      `${prefix}/cart`,
      `${prefix}/orders`,
      `${prefix}/profile`,
      `${prefix}/ledger`,
    ];
    for (const href of paths) {
      router.prefetch(href);
    }
  }, [phase, locale, router]);

  if (phase === "checking") {
    return (
      <div className="ds-dash-shell">
        <main className="ds-page">
          <p className="ds-text-muted">{t("messages.loading")}</p>
        </main>
      </div>
    );
  }

  if (phase === "denied") {
    return null;
  }

  return (
    <RealtimeProvider>
      <div className="ds-dash-shell">
        <SceneStage />
        <FlourDrift />
        <CartDropLayer />
        <div className="ds-top-header" style={{ padding: "0.85rem 0 0.35rem", display: "flex", justifyContent: "center" }}>
          <Image src="/logo.png" alt="Sari" width={120} height={34} style={{ height: "30px", width: "auto", objectFit: "contain" }} priority />
          <HeaderCartLink />
        </div>
        <div className="ds-nav-border">
          <DashboardNav />
        </div>
        <BannerStrip />
        {children}
        <AIAssistant />
      </div>
    </RealtimeProvider>
  );
}
