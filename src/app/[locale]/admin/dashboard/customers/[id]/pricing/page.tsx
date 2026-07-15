"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

type CustomerPricingSummary = {
  userId: string;
  businessType: string | null;
  overrides: Array<{ productId: string; productName: string; sku: string; basePrice: number; price: number }>;
  discounts: Array<{
    id: string;
    label: string;
    scope: string;
    type: string;
    value: number;
    productIds: string[];
    startsAt: string | null;
    endsAt: string | null;
  }>;
};

type ApiEnvelope<T> = { success?: boolean; data?: T; message?: string };

export default function AdminCustomerPricingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const t = useTranslations("adminDashboard");
  const locale = useLocale();
  const router = useRouter();

  const [data, setData] = useState<CustomerPricingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/customers/${id}/pricing`);
      if (res.status === 401) {
        router.replace(`/${locale}/admin/login`);
        return;
      }
      const json = (await res.json()) as ApiEnvelope<CustomerPricingSummary>;
      if (res.status === 200 && json.success && json.data) {
        setData(json.data);
        return;
      }
      setError(json.message ?? t("customerPricing.error"));
    } catch {
      setError(t("customerPricing.error"));
    } finally {
      setLoading(false);
    }
  }, [id, locale, router, t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <Link href={`/${locale}/admin/dashboard/customers`} className="admin-back-link">
        ← {t("customers.title")}
      </Link>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "0.35rem" }}>{t("customerPricing.title")}</h1>

      {error ? <p style={{ color: "var(--danger)", marginBottom: "1rem" }}>{error}</p> : null}

      {loading ? (
        <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "3rem 0" }}>
          {t("customerPricing.loading")}
        </p>
      ) : data ? (
        <>
          <p style={{ color: "var(--text-muted)", marginBottom: "1.5rem" }}>
            {t("customerPricing.businessType")}:{" "}
            {data.businessType ? t(`pricing.businessTypes.${data.businessType}`) : t("customerPricing.noBusinessType")}
          </p>

          <h2 style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>{t("customerPricing.overrides")}</h2>
          {data.overrides.length === 0 ? (
            <p style={{ color: "var(--text-muted)", marginBottom: "1.5rem" }}>{t("customerPricing.noOverrides")}</p>
          ) : (
            <div className="admin-table-wrap" style={{ marginBottom: "1.5rem" }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>{t("products.columns.name")}</th>
                    <th>{t("customerPricing.basePrice")}</th>
                    <th>{t("customerPricing.overridePrice")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.overrides.map((o) => (
                    <tr key={o.productId}>
                      <td style={{ fontWeight: 600 }}>
                        {o.productName}
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 400 }} dir="ltr">
                          {o.sku}
                        </div>
                      </td>
                      <td>₪{o.basePrice}</td>
                      <td style={{ fontWeight: 600 }}>₪{o.price}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h2 style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>{t("customerPricing.discounts")}</h2>
          {data.discounts.length === 0 ? (
            <p style={{ color: "var(--text-muted)" }}>{t("customerPricing.noDiscounts")}</p>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>{t("discounts.columns.label")}</th>
                    <th>{t("discounts.columns.scope")}</th>
                    <th>{t("discounts.columns.value")}</th>
                    <th>{t("discounts.columns.products")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.discounts.map((d) => (
                    <tr key={d.id}>
                      <td style={{ fontWeight: 600 }}>{d.label || "—"}</td>
                      <td>{t(`discounts.scopes.${d.scope}`)}</td>
                      <td>{d.type === "percent" ? `${d.value}%` : `₪${d.value}`}</td>
                      <td>{d.productIds.length === 0 ? t("discounts.allProducts") : d.productIds.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
