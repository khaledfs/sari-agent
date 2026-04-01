"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

export default function AdminOrdersPage() {
  const t = useTranslations("adminDashboard");
  const locale = useLocale();

  return (
    <div>
      <Link href={`/${locale}/admin/dashboard`} className="admin-back-link">
        ← {t("hub.backToDashboard")}
      </Link>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "1.5rem" }}>
        📦 {t("hub.cards.orders")}
      </h1>
      <p style={{ color: "var(--text-muted)" }}>{t("hub.comingSoon")}</p>
    </div>
  );
}
