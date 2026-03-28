"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { DashboardNav } from "@/components/dashboard-nav";

import "./dashboard-ui.css";

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
    <div className="ds-dash-shell">
      <DashboardNav />
      {children}
    </div>
  );
}
