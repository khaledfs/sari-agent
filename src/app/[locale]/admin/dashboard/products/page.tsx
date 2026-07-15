"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import { PRODUCT_CATEGORIES } from "@/lib/product-categories";

type AdminProductRow = {
  id: string;
  name: string;
  sku: string;
  category: string;
  price: number;
  unit: string;
  packageSize: string;
  imageUrl: string;
  isActive: boolean;
  stock: number | null;
  lowStockThreshold: number;
};

type ListData = {
  items: AdminProductRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

type ApiEnvelope<T> = { success?: boolean; data?: T; message?: string };

const EMPTY_FORM = {
  name: "",
  category: "",
  price: "",
  unit: "",
  packageSize: "",
  stock: "",
  sku: "",
};

export default function AdminProductsPage() {
  const t = useTranslations("adminDashboard");
  const locale = useLocale();
  const router = useRouter();

  const [data, setData] = useState<ListData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [active, setActive] = useState("all");
  const [page, setPage] = useState(1);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced search: typing updates searchInput; the query param follows 300ms later.
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
      const params = new URLSearchParams();
      params.set("page", String(page));
      if (search) params.set("search", search);
      if (category) params.set("category", category);
      if (active !== "all") params.set("active", active);
      const res = await fetch(`/api/admin/products?${params.toString()}`);
      if (res.status === 401) {
        router.replace(`/${locale}/admin/login`);
        return;
      }
      const json = (await res.json()) as ApiEnvelope<ListData>;
      if (res.status === 200 && json.success && json.data) {
        setData(json.data);
        return;
      }
      setError(json.message ?? t("products.error"));
    } catch {
      setError(t("products.error"));
    } finally {
      setLoading(false);
    }
  }, [page, search, category, active, locale, router, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function patchProduct(id: string, patch: Record<string, unknown>) {
    if (!data) return;
    const prev = data;
    setSavingId(id);
    setError("");
    // Optimistic: reflect the change immediately, roll back on failure.
    setData({
      ...data,
      items: data.items.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    });
    try {
      const res = await fetch(`/api/admin/products/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.status === 401) {
        router.replace(`/${locale}/admin/login`);
        return;
      }
      const json = (await res.json()) as ApiEnvelope<AdminProductRow>;
      if (res.status === 200 && json.success && json.data) {
        const updated = json.data;
        setData((d) =>
          d ? { ...d, items: d.items.map((p) => (p.id === updated.id ? updated : p)) } : d
        );
        return;
      }
      setData(prev);
      setError(json.message ?? t("products.updateError"));
    } catch {
      setData(prev);
      setError(t("products.updateError"));
    } finally {
      setSavingId(null);
    }
  }

  function commitNumber(row: AdminProductRow, field: "price" | "stock", raw: string) {
    const trimmed = raw.trim();
    if (field === "stock" && trimmed === "") {
      if (row.stock !== null) void patchProduct(row.id, { stock: null });
      return;
    }
    const value = Number(trimmed);
    if (!Number.isFinite(value)) return;
    if (field === "price" && value > 0 && value !== row.price) {
      void patchProduct(row.id, { price: value });
    }
    if (field === "stock" && Number.isInteger(value) && value >= 0 && value !== row.stock) {
      void patchProduct(row.id, { stock: value });
    }
  }

  async function createProduct() {
    setCreateError("");
    const price = Number(form.price);
    if (!form.name.trim() || !form.category || !Number.isFinite(price) || price <= 0) {
      setCreateError(t("products.form.invalid"));
      return;
    }
    setCreating(true);
    try {
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        category: form.category,
        price,
        unit: form.unit.trim(),
        packageSize: form.packageSize.trim(),
      };
      if (form.sku.trim()) body.sku = form.sku.trim();
      if (form.stock.trim() !== "") body.stock = Number(form.stock);
      const res = await fetch("/api/admin/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 401) {
        router.replace(`/${locale}/admin/login`);
        return;
      }
      const json = (await res.json()) as ApiEnvelope<AdminProductRow>;
      if (res.status === 200 && json.success && json.data) {
        setModalOpen(false);
        setForm({ ...EMPTY_FORM });
        await load();
        return;
      }
      setCreateError(json.message ?? t("products.form.createError"));
    } catch {
      setCreateError(t("products.form.createError"));
    } finally {
      setCreating(false);
    }
  }

  function categoryName(slug: string) {
    const c = PRODUCT_CATEGORIES.find((x) => x.slug === slug);
    if (!c) return slug || "—";
    return c.displayName[locale as "he" | "en" | "ar"] ?? c.displayName.en;
  }

  function stockBadge(row: AdminProductRow) {
    if (row.stock === null) return null;
    if (row.stock === 0) {
      return <span className="admin-stock-badge admin-stock-badge--out">{t("products.outOfStock")}</span>;
    }
    if (row.stock <= row.lowStockThreshold) {
      return <span className="admin-stock-badge admin-stock-badge--low">{t("products.lowStock")}</span>;
    }
    return null;
  }

  const items = data?.items ?? [];

  return (
    <div>
      <Link href={`/${locale}/admin/dashboard`} className="admin-back-link">
        ← {t("hub.backToDashboard")}
      </Link>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "0.35rem" }}>{t("products.title")}</h1>
      <p style={{ color: "var(--text-muted)", marginBottom: "1.25rem" }}>{t("products.subtitle")}</p>

      <div className="admin-toolbar">
        <input
          type="search"
          className="admin-input"
          value={searchInput}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t("products.searchPlaceholder")}
          aria-label={t("products.searchPlaceholder")}
        />
        <select
          className="admin-select"
          value={category}
          onChange={(e) => {
            setPage(1);
            setCategory(e.target.value);
          }}
          aria-label={t("products.filters.category")}
        >
          <option value="">{t("products.filters.allCategories")}</option>
          {PRODUCT_CATEGORIES.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.displayName[locale as "he" | "en" | "ar"] ?? c.displayName.en}
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
          <option value="active">{t("products.filters.activeOnly")}</option>
          <option value="inactive">{t("products.filters.inactiveOnly")}</option>
        </select>
        <button type="button" className="admin-btn-primary" onClick={() => setModalOpen(true)}>
          + {t("products.addProduct")}
        </button>
      </div>

      {error ? <p style={{ color: "var(--danger)", marginBottom: "1rem" }}>{error}</p> : null}

      {loading && !data ? (
        <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "3rem 0" }}>
          {t("products.loading")}
        </p>
      ) : items.length === 0 ? (
        <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "3rem 0" }}>
          {t("products.empty")}
        </p>
      ) : (
        <>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th aria-label={t("products.columns.image")} />
                  <th>{t("products.columns.name")}</th>
                  <th>{t("products.columns.category")}</th>
                  <th>{t("products.columns.price")}</th>
                  <th>{t("products.columns.stock")}</th>
                  <th>{t("products.columns.unit")}</th>
                  <th>{t("products.columns.active")}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id} style={row.isActive ? undefined : { opacity: 0.55 }}>
                    <td>
                      {row.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={row.imageUrl}
                          alt=""
                          width={40}
                          height={40}
                          style={{ objectFit: "contain", borderRadius: "6px" }}
                        />
                      ) : (
                        <span aria-hidden="true">🏷️</span>
                      )}
                    </td>
                    <td style={{ fontWeight: 600, maxWidth: "260px" }}>
                      {row.name}
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 400 }} dir="ltr">
                        {row.sku}
                      </div>
                    </td>
                    <td>{categoryName(row.category)}</td>
                    <td>
                      <input
                        key={`price-${row.id}-${row.price}`}
                        type="number"
                        step="0.1"
                        min="0.01"
                        className="admin-inline-input"
                        defaultValue={row.price}
                        disabled={savingId === row.id}
                        onBlur={(e) => commitNumber(row, "price", e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        }}
                        aria-label={`${t("products.columns.price")} — ${row.name}`}
                      />
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                        <input
                          key={`stock-${row.id}-${String(row.stock)}`}
                          type="number"
                          step="1"
                          min="0"
                          className="admin-inline-input"
                          defaultValue={row.stock ?? ""}
                          placeholder={t("products.untracked")}
                          disabled={savingId === row.id}
                          onBlur={(e) => commitNumber(row, "stock", e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                          }}
                          aria-label={`${t("products.columns.stock")} — ${row.name}`}
                        />
                        {stockBadge(row)}
                      </div>
                    </td>
                    <td>{row.unit || "—"}</td>
                    <td>
                      <label className="admin-toggle">
                        <input
                          type="checkbox"
                          checked={row.isActive}
                          disabled={savingId === row.id}
                          onChange={(e) => void patchProduct(row.id, { isActive: e.target.checked })}
                          aria-label={`${t("products.columns.active")} — ${row.name}`}
                        />
                        <span>{row.isActive ? t("products.active") : t("products.inactive")}</span>
                      </label>
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
              {" · "}
              {t("products.pagination.items", { count: data?.total ?? 0 })}
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

      {modalOpen ? (
        <div className="admin-modal-backdrop" role="dialog" aria-modal="true" aria-label={t("products.addProduct")}>
          <div className="admin-modal">
            <h2 style={{ fontSize: "1.15rem", marginBottom: "1rem" }}>{t("products.addProduct")}</h2>

            <label className="admin-field">
              <span>{t("products.form.name")}</span>
              <input
                className="admin-input"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </label>
            <label className="admin-field">
              <span>{t("products.form.category")}</span>
              <select
                className="admin-select"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              >
                <option value="">—</option>
                {PRODUCT_CATEGORIES.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.displayName[locale as "he" | "en" | "ar"] ?? c.displayName.en}
                  </option>
                ))}
              </select>
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              <label className="admin-field">
                <span>{t("products.form.price")}</span>
                <input
                  className="admin-input"
                  type="number"
                  step="0.1"
                  min="0.01"
                  value={form.price}
                  onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                />
              </label>
              <label className="admin-field">
                <span>{t("products.form.stock")}</span>
                <input
                  className="admin-input"
                  type="number"
                  step="1"
                  min="0"
                  value={form.stock}
                  placeholder={t("products.untracked")}
                  onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))}
                />
              </label>
              <label className="admin-field">
                <span>{t("products.form.unit")}</span>
                <input
                  className="admin-input"
                  value={form.unit}
                  onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                />
              </label>
              <label className="admin-field">
                <span>{t("products.form.packageSize")}</span>
                <input
                  className="admin-input"
                  value={form.packageSize}
                  onChange={(e) => setForm((f) => ({ ...f, packageSize: e.target.value }))}
                />
              </label>
            </div>
            <label className="admin-field">
              <span>{t("products.form.sku")}</span>
              <input
                className="admin-input"
                value={form.sku}
                placeholder={t("products.form.skuAuto")}
                onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
                dir="ltr"
              />
            </label>

            {createError ? (
              <p style={{ color: "var(--danger)", marginTop: "0.5rem" }}>{createError}</p>
            ) : null}

            <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.25rem", justifyContent: "flex-end" }}>
              <button
                type="button"
                className="admin-btn"
                disabled={creating}
                onClick={() => {
                  setModalOpen(false);
                  setCreateError("");
                }}
              >
                {t("products.form.cancel")}
              </button>
              <button type="button" className="admin-btn-primary" disabled={creating} onClick={() => void createProduct()}>
                {creating ? t("products.form.creating") : t("products.form.create")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
