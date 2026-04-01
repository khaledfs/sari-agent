"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

type Customer = {
  _id: string;
  businessName: string;
  email: string;
  phoneNumber: string;
  isVerified: boolean;
  createdAt: string;
};

export default function AdminCustomersPage() {
  const t = useTranslations("adminDashboard");
  const locale = useLocale();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/customers");
        const json = (await res.json()) as { success: boolean; data?: Customer[]; message?: string };
        if (!json.success || !json.data) {
          setError(json.message ?? t("customers.error"));
          return;
        }
        setCustomers(json.data);
      } catch {
        setError(t("customers.error"));
      } finally {
        setLoading(false);
      }
    })();
  }, [t]);

  function formatDate(iso: string) {
    try {
      return new Date(iso).toLocaleDateString(locale, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return iso;
    }
  }

  return (
    <div>
      <Link href={`/${locale}/admin/dashboard`} className="admin-back-link">
        ← {t("hub.backToDashboard")}
      </Link>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "1.5rem" }}>
        {t("customers.title")}
      </h1>

      {loading && (
        <div style={{ display: "flex", justifyContent: "center", padding: "3rem 0" }}>
          <div className="admin-spinner" />
        </div>
      )}

      {error && (
        <p style={{ color: "var(--danger)", textAlign: "center" }}>{error}</p>
      )}

      {!loading && !error && customers.length === 0 && (
        <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "3rem 0" }}>
          {t("customers.empty")}
        </p>
      )}

      {!loading && !error && customers.length > 0 && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t("customers.columns.businessName")}</th>
                <th>{t("customers.columns.email")}</th>
                <th>{t("customers.columns.phone")}</th>
                <th>{t("customers.columns.verified")}</th>
                <th>{t("customers.columns.joined")}</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c._id}>
                  <td style={{ fontWeight: 600 }}>{c.businessName}</td>
                  <td>{c.email}</td>
                  <td dir="ltr">{c.phoneNumber}</td>
                  <td>
                    <span className={`admin-badge ${c.isVerified ? "admin-badge-success" : "admin-badge-muted"}`}>
                      {c.isVerified ? t("customers.verified") : t("customers.notVerified")}
                    </span>
                  </td>
                  <td>{formatDate(c.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
