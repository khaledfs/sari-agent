"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Image from "next/image";

import { LanguageSwitcher } from "@/components/language-switcher";
import { RealtimeProvider } from "@/components/realtime/realtime-provider";

import { AdminAuthProvider, useConsoleAuth } from "./admin-auth-context";

export default function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminAuthProvider>
      <AdminDashboardShell>{children}</AdminDashboardShell>
    </AdminAuthProvider>
  );
}

function AdminDashboardShell({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const router = useRouter();
  const t = useTranslations("adminDashboard");
  const locale = typeof params.locale === "string" ? params.locale : "en";
  const { phase, role } = useConsoleAuth();
  const didPrefetch = useRef(false);

  // Agent indicator (Task D): who am I + how many customers I hold.
  const [identity, setIdentity] = useState<{ businessName: string; customerCount: number | null } | null>(null);
  useEffect(() => {
    if (phase !== "allowed" || role !== "agent") return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/me");
        const json = (await res.json()) as {
          success?: boolean;
          data?: { businessName?: string; customerCount?: number | null };
        };
        if (!cancelled && json.success && json.data) {
          setIdentity({ businessName: json.data.businessName ?? "", customerCount: json.data.customerCount ?? null });
        }
      } catch {
        // indicator is decorative — fail soft
      }
    })();
    return () => { cancelled = true; };
  }, [phase, role]);

  useEffect(() => {
    if (phase !== "allowed" || didPrefetch.current) return;
    didPrefetch.current = true;
    const base = `/${locale}/admin/dashboard`;
    const paths = [base, `${base}/overview`, `${base}/customers`, `${base}/orders`, `${base}/products`, `${base}/settings`];
    for (const href of paths) {
      router.prefetch(href);
    }
  }, [phase, locale, router]);

  if (phase === "checking") {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100dvh" }}>
        <div className="admin-spinner" />
      </div>
    );
  }

  if (phase === "denied") {
    return null;
  }

  return (
    <RealtimeProvider>
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100dvh", width: "100%" }}>
      <header style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0.75rem 1.5rem",
        borderBottom: "1px solid var(--border)",
        background: "var(--surface)",
        width: "100%",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <Image src="/logo.png" alt="Sari" width={100} height={28} style={{ height: "28px", width: "auto", objectFit: "contain" }} priority />
          <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--brand)", background: "var(--brand-bg)", padding: "0.15rem 0.5rem", borderRadius: "var(--radius-pill)" }}>
            {role === "agent" ? t("agentBadge") : t("badge")}
          </span>
          {role === "agent" && identity ? (
            <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>
              {identity.businessName}
              {identity.customerCount !== null ? ` · ${t("agentCustomers", { count: identity.customerCount })}` : ""}
            </span>
          ) : null}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <LanguageSwitcher />
        <button
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" });
            try { localStorage.removeItem("authToken"); } catch { /* ignore */ }
            router.replace(`/${locale}/admin/login`);
          }}
          style={{
            background: "transparent",
            color: "var(--text-secondary)",
            border: "1px solid var(--border)",
            fontSize: "0.8125rem",
            padding: "0.35rem 0.85rem",
          }}
        >
          {t("actions.logout")}
        </button>
        </div>
      </header>
      <main style={{ flex: 1, display: "flex", justifyContent: "center", padding: "2rem 1.5rem" }}>
        <div style={{ width: "100%", maxWidth: "900px" }}>
          {children}
        </div>
      </main>
    </div>
    </RealtimeProvider>
  );
}
