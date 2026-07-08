"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

export function SessionBootstrap({ locale }: { locale: string }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const customerDashboard = `/${locale}/dashboard`;
    const adminDashboard = `/${locale}/admin/dashboard`;
    const customerLogin = `/${locale}/login`;
    const adminLogin = `/${locale}/admin/login`;
    const homePath = `/${locale}`;

    (async () => {
      try {
        const res = await fetch("/api/auth/session", { method: "GET" });
        const json = (await res.json()) as {
          data?: { authenticated?: boolean; payload?: { role?: string } };
        };
        const authenticated = json.data?.authenticated === true;
        const role = json.data?.payload?.role;

        if (authenticated) {
          if (role === "admin") {
            if (pathname === adminLogin || pathname === homePath) {
              router.replace(adminDashboard);
            }
          } else {
            if (pathname === customerLogin || pathname === homePath) {
              router.replace(customerDashboard);
            }
          }
          return;
        }

        // Logged-out users on dashboard are handled by their respective layout.tsx guards.
      } catch {
        // ignore
      }
    })();
  }, [locale, pathname, router]);

  return null;
}

