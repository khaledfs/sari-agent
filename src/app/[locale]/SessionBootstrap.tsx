"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

export function SessionBootstrap({ locale }: { locale: string }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const dashboardPath = `/${locale}/dashboard`;
    const loginPath = `/${locale}/login`;
    const homePath = `/${locale}`;

    (async () => {
      try {
        const res = await fetch("/api/auth/session", { method: "GET" });
        const json = (await res.json()) as {
          data?: { authenticated?: boolean };
        };
        const authenticated = json.data?.authenticated === true;

        if (authenticated) {
          if (pathname === loginPath || pathname === homePath) {
            router.replace(dashboardPath);
          }
          return;
        }

        // Logged-out users on dashboard are handled by `dashboard/layout.tsx` (no flash of page content).
        // Keep SessionBootstrap focused on redirecting authenticated users away from login/home.
      } catch {
        // ignore
      }
    })();
  }, [locale, pathname, router]);

  return null;
}

