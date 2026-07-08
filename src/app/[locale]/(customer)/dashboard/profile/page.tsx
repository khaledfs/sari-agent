"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

type AccountApiData = {
  profile: {
    businessName: string;
    phoneNumber: string;
    email: string;
  };
  summary: {
    balance: number;
    totalDebt: number;
    lastPaymentDate: string | null;
  };
  payments: Array<{ date: string; amount: number }>;
};

export default function ProfilePage() {
  const t = useTranslations("account");
  const tNav = useTranslations("dashboard.nav");
  const locale = useLocale();
  const [data, setData] = useState<AccountApiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetch("/api/account", { method: "GET" });
      const json = (await res.json()) as {
        success?: boolean;
        data?: AccountApiData;
        message?: string;
      };
      if (res.status === 401) {
        setError(t("error"));
        setData(null);
        return;
      }
      if (res.status === 200 && json.success && json.data) {
        setData(json.data);
        return;
      }
      setError(json.message ?? t("error"));
    } catch {
      setError(t("error"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  function formatDate(iso: string | null) {
    if (!iso) return "—";
    try {
      return new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  }

  return (
    <main className="ds-page">
      <div className="ds-profile-section">
        <Link href={`/${locale}/dashboard`} className="ds-link">
          ← {tNav("home")}
        </Link>
      </div>
      <h1 className="ds-page-title ds-title-after-link">{t("title")}</h1>

      {loading ? <p className="ds-text-muted ds-mt-sm">{t("loading")}</p> : null}
      {error ? <p className="ds-error ds-mt-sm">{error}</p> : null}

      {!loading && data ? (
        <div className="ds-stack ds-content-after-title">
          <section className="ds-card ds-stack ds-stack--tight">
            <h2 className="ds-section-title">{t("businessProfile")}</h2>
            <p className="ds-text-small">
              <strong>{t("businessName")}:</strong> {data.profile.businessName}
            </p>
            <p className="ds-text-small">
              <strong>{t("phoneNumber")}:</strong> {data.profile.phoneNumber}
            </p>
            <p className="ds-text-small">
              <strong>{t("email")}:</strong> {data.profile.email}
            </p>
          </section>

          <section className="ds-card ds-stack ds-stack--tight">
            <h2 className="ds-section-title">{t("accountSummary")}</h2>
            <p className="ds-text-small">
              <strong>{t("balance")}:</strong> {data.summary.balance}
            </p>
            <p className="ds-text-small">
              <strong>{t("totalDebt")}:</strong> {data.summary.totalDebt}
            </p>
            <p className="ds-text-small">
              <strong>{t("lastPaymentDate")}:</strong> {formatDate(data.summary.lastPaymentDate)}
            </p>
          </section>

          <section className="ds-card ds-stack ds-stack--tight">
            <h2 className="ds-section-title">{t("paymentsOverview")}</h2>
            {data.payments.length === 0 ? (
              <p className="ds-text-muted">{t("noPayments")}</p>
            ) : (
              <ul className="ds-list">
                {data.payments.map((p, index) => (
                  <li key={`${p.date}-${index}`} className="ds-payment-row">
                    <span className="ds-text-small">
                      <strong>{t("paymentDate")}:</strong> {formatDate(p.date)}
                    </span>
                    <span className="ds-text-small">
                      <strong>{t("paymentAmount")}:</strong> {p.amount}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : null}
    </main>
  );
}
