"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";

type Phase = "checking" | "allowed" | "denied";

const AdminAuthContext = createContext<Phase>("checking");

export function useAdminAuth() {
  return useContext(AdminAuthContext);
}

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const params = useParams();
  const router = useRouter();
  const locale = typeof params.locale === "string" ? params.locale : "en";
  const [phase, setPhase] = useState<Phase>("checking");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/session", { method: "GET" });
        const json = (await res.json()) as {
          data?: { authenticated?: boolean; payload?: { role?: string } };
        };
        if (cancelled) return;
        if (json.data?.authenticated !== true || json.data.payload?.role !== "admin") {
          setPhase("denied");
          router.replace(`/${locale}/admin/login`);
          return;
        }
        setPhase("allowed");
      } catch {
        if (cancelled) return;
        setPhase("denied");
        router.replace(`/${locale}/admin/login`);
      }
    })();
    return () => { cancelled = true; };
  }, [locale, router]);

  return (
    <AdminAuthContext.Provider value={phase}>
      {children}
    </AdminAuthContext.Provider>
  );
}
