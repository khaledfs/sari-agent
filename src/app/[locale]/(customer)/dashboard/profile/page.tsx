"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { formatMinorUnits } from "@/lib/money";

type AccountApiData = {
  profile: {
    businessName: string;
    phoneNumber: string;
    email: string;
  };
  /** Real ledger-derived summary (agorot) — Work Order Issue 8. */
  summary: {
    balanceMinor: number;
    currency: string;
    lastEntryAt: string | null;
  };
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
              <strong>{t("balance")}:</strong> {formatMinorUnits(locale, data.summary.balanceMinor)}
            </p>
            <p className="ds-text-small">
              <strong>{t("lastEntryAt")}:</strong> {formatDate(data.summary.lastEntryAt)}
            </p>
            <Link href={`/${locale}/dashboard/ledger`} className="ds-link">
              {t("viewLedger")}
            </Link>
          </section>
        </div>
      ) : null}
    </main>
  );
}
