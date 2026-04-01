import Link from "next/link";
import { getTranslations } from "next-intl/server";

export default async function AdminOrdersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "adminDashboard" });

  return (
    <div>
      <Link href={`/${locale}/admin/dashboard`} className="admin-back-link">
        ← {t("hub.backToDashboard")}
      </Link>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "1.5rem" }}>
        {t("hub.cards.orders")}
      </h1>
      <p style={{ color: "var(--text-muted)" }}>{t("hub.comingSoon")}</p>
    </div>
  );
}
