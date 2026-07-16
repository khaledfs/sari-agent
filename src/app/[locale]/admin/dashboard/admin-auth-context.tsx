"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";

type Phase = "checking" | "allowed" | "denied";
export type ConsoleRole = "admin" | "agent" | null;

type ConsoleAuth = { phase: Phase; role: ConsoleRole };

const AdminAuthContext = createContext<ConsoleAuth>({ phase: "checking", role: null });

/** Back-compat: existing pages read the phase only. */
export function useAdminAuth(): Phase {
  return useContext(AdminAuthContext).phase;
}

/** Task D: role-aware consumers (nav hiding, form scope limits — UX only). */
export function useConsoleAuth(): ConsoleAuth {
  return useContext(AdminAuthContext);
}

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const params = useParams();
  const router = useRouter();
  const locale = typeof params.locale === "string" ? params.locale : "en";
  const [auth, setAuth] = useState<ConsoleAuth>({ phase: "checking", role: null });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/session", { method: "GET" });
        const json = (await res.json()) as {
          data?: { authenticated?: boolean; payload?: { role?: string } };
        };
        if (cancelled) return;
        const role = json.data?.payload?.role;
        // The console admits admins AND field agents (Task D); the server
        // scopes every request regardless of what the UI shows.
        if (json.data?.authenticated !== true || (role !== "admin" && role !== "agent")) {
          setAuth({ phase: "denied", role: null });
          router.replace(`/${locale}/admin/login`);
          return;
        }
        setAuth({ phase: "allowed", role });
      } catch {
        if (cancelled) return;
        setAuth({ phase: "denied", role: null });
        router.replace(`/${locale}/admin/login`);
      }
    })();
    return () => { cancelled = true; };
  }, [locale, router]);

  return (
    <AdminAuthContext.Provider value={auth}>
      {children}
    </AdminAuthContext.Provider>
  );
}
