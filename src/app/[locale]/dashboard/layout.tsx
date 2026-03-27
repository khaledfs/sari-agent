"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

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
      <main style={{ padding: "1.25rem", maxWidth: "720px", margin: "0 auto", width: "100%" }}>
        <p>{t("messages.loading")}</p>
      </main>
    );
  }

  if (phase === "denied") {
    return null;
  }

  return <>{children}</>;
}
