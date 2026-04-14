import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

import { listAdminCustomers } from "@/lib/admin-customers";

export default async function AdminCustomersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("adminDashboard");

  let customers;
  try {
    customers = await listAdminCustomers();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Not authenticated." || msg === "Access denied.") {
      redirect(`/${locale}/admin/login`);
    }
    return (
      <div>
        <Link href={`/${locale}/admin/dashboard`} className="admin-back-link">
          ← {t("hub.backToDashboard")}
        </Link>
        <h1 style={{ fontSize: "1.5rem", marginBottom: "1.5rem" }}>{t("customers.title")}</h1>
        <p style={{ color: "var(--danger)", textAlign: "center" }}>{t("customers.error")}</p>
      </div>
    );
  }

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

      {customers.length === 0 ? (
        <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "3rem 0" }}>
          {t("customers.empty")}
        </p>
      ) : (
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
                    <span
                      className={`admin-badge ${c.isVerified ? "admin-badge-success" : "admin-badge-muted"}`}
                    >
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
