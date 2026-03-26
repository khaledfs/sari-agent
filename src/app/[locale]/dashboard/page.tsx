"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

export default function DashboardPage() {
  const t = useTranslations("dashboard");
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/session", { method: "GET" });
        const json = (await res.json()) as { authenticated?: boolean };
        if (!json.authenticated) {
          router.replace("./login");
          return;
        }
        setReady(true);
      } catch {
        router.replace("./login");
      }
    })();
  }, [router]);

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
    router.replace("./login");
  }

  if (!ready) {
    return (
      <main style={{ padding: "1.25rem", maxWidth: "720px", margin: "0 auto", width: "100%" }}>
        <p>{t("messages.loading")}</p>
      </main>
    );
  }

  return (
    <main style={{ padding: "1.25rem", maxWidth: "720px", margin: "0 auto", width: "100%" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>{t("title")}</h1>
      <p style={{ marginTop: "0.5rem" }}>{t("messages.welcome")}</p>
      <button onClick={logout} style={{ marginTop: "1rem", padding: "0.65rem 1rem" }}>
        {t("actions.logout")}
      </button>
    </main>
  );
}

