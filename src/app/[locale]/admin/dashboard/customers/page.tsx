"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

type CustomerRow = {
  id: string;
  businessName: string;
  email: string;
  phoneNumber: string;
  businessType: string | null;
  isVerified: boolean;
  accountStatus: "active" | "restricted";
  restrictedAt: string | null;
  restrictedReason: string;
  createdAt: string;
  totalOrders: number;
  lifetimeSpend: number;
  lastOrderDate: string | null;
};

type ListData = {
  items: CustomerRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

type ApiEnvelope<T> = { success?: boolean; data?: T; message?: string };

const BUSINESS_TYPES = ["bakery", "oriental_sweets", "western_sweets", "cafe", "ice_cream"] as const;

export default function AdminCustomersPage() {
  const t = useTranslations("adminDashboard");
  const locale = useLocale();
  const router = useRouter();

  const [data, setData] = useState<ListData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [active, setActive] = useState("all");
  const [page, setPage] = useState(1);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function onSearchChange(value: string) {
    setSearchInput(value);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setPage(1);
      setSearch(value.trim());
    }, 300);
  }

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (search) params.set("search", search);
      if (businessType) params.set("businessType", businessType);
      if (active !== "all") params.set("active", active);
      const res = await fetch(`/api/admin/customers?${params.toString()}`);
      if (res.status === 401) {
        router.replace(`/${locale}/admin/login`);
        return;
      }
      const json = (await res.json()) as ApiEnvelope<ListData>;
      if (res.status === 200 && json.success && json.data) {
        setData(json.data);
        return;
      }
      setError(json.message ?? t("customers.error"));
    } catch {
      setError(t("customers.error"));
    } finally {
      setLoading(false);
    }
  }, [page, search, businessType, active, locale, router, t]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Ordering-state flip (active ⇄ restricted) with optimistic update + rollback. */
  async function toggleRestricted(row: CustomerRow) {
    if (!data) return;
    const prev = data;
    const nextStatus = row.accountStatus === "restricted" ? "active" : "restricted";
    setBusyId(row.id);
    setError("");
    setData({
      ...data,
      items: data.items.map((c) => (c.id === row.id ? { ...c, accountStatus: nextStatus } : c)),
    });
    try {
      const res = await fetch(`/api/admin/customers/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountStatus: nextStatus }),
      });
      const json = (await res.json()) as ApiEnvelope<{ customer: CustomerRow }>;
      if (res.status === 200 && json.success && json.data?.customer) {
        const updated = json.data.customer;
        setData((d) =>
          d ? { ...d, items: d.items.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)) } : d
        );
        return;
      }
      setData(prev);
      setError(json.message ?? t("customers.error"));
    } catch {
      setData(prev);
      setError(t("customers.error"));
    } finally {
      setBusyId(null);
    }
  }

  function formatDate(iso: string | null) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
    } catch {
      return iso;
    }
  }

  const items = data?.items ?? [];

  return (
    <div>
      <Link href={`/${locale}/admin/dashboard`} className="admin-back-link">
        ← {t("hub.backToDashboard")}
      </Link>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "0.35rem" }}>{t("customers.title")}</h1>
      <p style={{ color: "var(--text-muted)", marginBottom: "1.25rem" }}>{t("customers.subtitle")}</p>

      <div className="admin-toolbar">
        <input
          type="search"
          className="admin-input"
          value={searchInput}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t("customers.searchPlaceholder")}
          aria-label={t("customers.searchPlaceholder")}
        />
        <select
          className="admin-select"
          value={businessType}
          onChange={(e) => {
            setPage(1);
            setBusinessType(e.target.value);
          }}
          aria-label={t("discounts.form.businessType")}
        >
          <option value="">{t("customers.allTypes")}</option>
          {BUSINESS_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(`pricing.businessTypes.${type}`)}
            </option>
          ))}
        </select>
        <select
          className="admin-select"
          value={active}
          onChange={(e) => {
            setPage(1);
            setActive(e.target.value);
          }}
          aria-label={t("products.filters.active")}
        >
          <option value="all">{t("products.filters.all")}</option>
          <option value="active">{t("customers.activeOnly")}</option>
          <option value="restricted">{t("customers.restrictedOnly")}</option>
        </select>
      </div>

      {error ? <p style={{ color: "var(--danger)", marginBottom: "1rem" }}>{error}</p> : null}

      {loading && !data ? (
        <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "3rem 0" }}>
          {t("customers.loading")}
        </p>
      ) : items.length === 0 ? (
        <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "3rem 0" }}>
          {t("customers.empty")}
        </p>
      ) : (
        <>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t("customers.columns.businessName")}</th>
                  <th>{t("customers.columns.phone")}</th>
                  <th>{t("customers.columns.businessType")}</th>
                  <th>{t("customers.columns.totalOrders")}</th>
                  <th>{t("customers.columns.lifetimeSpend")}</th>
                  <th>{t("customers.columns.lastOrder")}</th>
                  <th>{t("customers.columns.status")}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((c) => (
                  <tr key={c.id} style={c.accountStatus === "restricted" ? { opacity: 0.7 } : undefined}>
                    <td style={{ fontWeight: 600 }}>
                      <Link
                        href={`/${locale}/admin/dashboard/customers/${c.id}`}
                        className="admin-back-link"
                        style={{ marginBottom: 0 }}
                      >
                        {c.businessName}
                      </Link>
                      <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontWeight: 400 }}>{c.email}</div>
                    </td>
                    <td dir="ltr">{c.phoneNumber}</td>
                    <td>{c.businessType ? t(`pricing.businessTypes.${c.businessType}`) : "—"}</td>
                    <td>{c.totalOrders}</td>
                    <td>₪{c.lifetimeSpend.toLocaleString(locale)}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{formatDate(c.lastOrderDate)}</td>
                    <td>
                      <span
                        className={`admin-stock-badge ${c.accountStatus === "restricted" ? "admin-stock-badge--out" : "admin-stock-badge--low"}`}
                        title={c.accountStatus === "restricted" && c.restrictedReason ? c.restrictedReason : undefined}
                      >
                        {c.accountStatus === "restricted" ? t("customers.restricted") : t("customers.active")}
                      </span>
                      <button
                        type="button"
                        className="admin-btn"
                        style={{ marginInlineStart: "0.5rem" }}
                        disabled={busyId === c.id}
                        onClick={() => void toggleRestricted(c)}
                        aria-label={`${t("customers.columns.status")} — ${c.businessName}`}
                      >
                        {c.accountStatus === "restricted" ? t("customers.unrestrict") : t("customers.restrict")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="admin-pagination">
            <button
              type="button"
              className="admin-btn"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              {t("products.pagination.prev")}
            </button>
            <span style={{ color: "var(--text-muted)" }}>
              {t("products.pagination.pageOf", { page: data?.page ?? page, total: data?.totalPages ?? 1 })}
            </span>
            <button
              type="button"
              className="admin-btn"
              disabled={loading || (data ? page >= data.totalPages : true)}
              onClick={() => setPage((p) => p + 1)}
            >
              {t("products.pagination.next")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
