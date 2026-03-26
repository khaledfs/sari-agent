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
        const json = (await res.json()) as { authenticated?: boolean };

        if (json.authenticated) {
          if (pathname === loginPath || pathname === homePath) {
            router.replace(dashboardPath);
          }
          return;
        }

        if (pathname === dashboardPath) {
          router.replace(loginPath);
        }
      } catch {
        // ignore
      }
    })();
  }, [locale, pathname, router]);

  return null;
}

