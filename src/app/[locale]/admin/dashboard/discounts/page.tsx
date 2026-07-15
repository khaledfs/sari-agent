"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

type DiscountRow = {
  id: string;
  label: string;
  scope: string;
  targetId: string;
  type: string;
  value: number;
  productIds: string[];
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
};

type CustomerOption = { _id: string; businessName: string; phoneNumber: string };
type ProductOption = { id: string; name: string; sku: string };
type ApiEnvelope<T> = { success?: boolean; data?: T; message?: string };

const BUSINESS_TYPES = ["bakery", "oriental_sweets", "western_sweets", "cafe", "ice_cream"] as const;

type FormState = {
  id: string | null;
  label: string;
  scope: string;
  targetId: string;
  type: string;
  value: string;
  startsAt: string;
  endsAt: string;
  products: ProductOption[];
};

const EMPTY_FORM: FormState = {
  id: null,
  label: "",
  scope: "global",
  targetId: "",
  type: "percent",
  value: "",
  startsAt: "",
  endsAt: "",
  products: [],
};

export default function AdminDiscountsPage() {
  const t = useTranslations("adminDashboard");
  const locale = useLocale();
  const router = useRouter();

  const [discounts, setDiscounts] = useState<DiscountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM });
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [productResults, setProductResults] = useState<ProductOption[]>([]);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetch("/api/admin/discounts");
      if (res.status === 401) {
        router.replace(`/${locale}/admin/login`);
        return;
      }
      const json = (await res.json()) as ApiEnvelope<DiscountRow[]>;
      if (res.status === 200 && json.success && json.data) {
        setDiscounts(json.data);
        return;
      }
      setError(json.message ?? t("discounts.error"));
    } catch {
      setError(t("discounts.error"));
    } finally {
      setLoading(false);
    }
  }, [locale, router, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function ensureCustomers() {
    if (customers.length > 0) return;
    try {
      const res = await fetch("/api/admin/customers");
      const json = (await res.json()) as ApiEnvelope<CustomerOption[]>;
      if (json.success && json.data) setCustomers(json.data);
    } catch {
      // picker stays empty; validation will catch it
    }
  }

  function onProductSearch(value: string) {
    setProductSearch(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!value.trim()) {
      setProductResults([]);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/products?search=${encodeURIComponent(value.trim())}&pageSize=8`);
        const json = (await res.json()) as ApiEnvelope<{ items: Array<{ id: string; name: string; sku: string }> }>;
        setProductResults(json.data?.items ?? []);
      } catch {
        setProductResults([]);
      }
    }, 300);
  }

  function openCreate() {
    setForm({ ...EMPTY_FORM });
    setFormError("");
    setProductSearch("");
    setProductResults([]);
    setFormOpen(true);
  }

  function openEdit(d: DiscountRow) {
    setForm({
      id: d.id,
      label: d.label,
      scope: d.scope,
      targetId: d.targetId,
      type: d.type,
      value: String(d.value),
      startsAt: d.startsAt ? d.startsAt.slice(0, 10) : "",
      endsAt: d.endsAt ? d.endsAt.slice(0, 10) : "",
      // Ids as placeholder labels until the names are hydrated below.
      products: d.productIds.map((id) => ({ id, name: id, sku: "" })),
    });
    setFormError("");
    setProductSearch("");
    setProductResults([]);
    setFormOpen(true);
    if (d.scope === "customer") void ensureCustomers();
    void hydrateProductNames(d.productIds);
  }

  /** Resolves display names for pre-existing product ids in the edit form. */
  async function hydrateProductNames(ids: string[]) {
    if (ids.length === 0) return;
    try {
      const entries = await Promise.all(
        ids.map(async (id) => {
          try {
            const res = await fetch(`/api/products/${id}`);
            const json = (await res.json()) as ApiEnvelope<{ name?: string; sku?: string }>;
            return [id, json.success ? json.data ?? null : null] as const;
          } catch {
            return [id, null] as const;
          }
        })
      );
      const byId = new Map(entries.filter(([, p]) => p?.name));
      if (byId.size === 0) return;
      setForm((f) => ({
        ...f,
        products: f.products.map((p) => {
          const fetched = byId.get(p.id);
          return fetched?.name ? { ...p, name: fetched.name, sku: fetched.sku ?? "" } : p;
        }),
      }));
    } catch {
      // ids remain visible as a fallback label
    }
  }

  async function saveForm() {
    setFormError("");
    const value = Number(form.value);
    if (!Number.isFinite(value)) {
      setFormError(t("discounts.form.invalid"));
      return;
    }
    setSaving(true);
    try {
      const body = {
        label: form.label.trim(),
        scope: form.scope,
        targetId: form.targetId,
        type: form.type,
        value,
        productIds: form.products.map((p) => p.id),
        startsAt: form.startsAt ? new Date(`${form.startsAt}T00:00:00`).toISOString() : null,
        endsAt: form.endsAt ? new Date(`${form.endsAt}T23:59:59`).toISOString() : null,
      };
      const res = await fetch(form.id ? `/api/admin/discounts/${form.id}` : "/api/admin/discounts", {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 401) {
        router.replace(`/${locale}/admin/login`);
        return;
      }
      const json = (await res.json()) as ApiEnvelope<DiscountRow>;
      if (res.status === 200 && json.success) {
        setFormOpen(false);
        await load();
        return;
      }
      setFormError(json.message ?? t("discounts.form.saveError"));
    } catch {
      setFormError(t("discounts.form.saveError"));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(d: DiscountRow) {
    setBusyId(d.id);
    setError("");
    try {
      const res = await fetch(`/api/admin/discounts/${d.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !d.isActive }),
      });
      const json = (await res.json()) as ApiEnvelope<DiscountRow>;
      if (res.status === 200 && json.success && json.data) {
        const updated = json.data;
        setDiscounts((list) => list.map((x) => (x.id === updated.id ? updated : x)));
        return;
      }
      setError(json.message ?? t("discounts.error"));
    } catch {
      setError(t("discounts.error"));
    } finally {
      setBusyId(null);
    }
  }

  function scopeLabel(d: DiscountRow) {
    if (d.scope === "global") return t("discounts.scopes.global");
    if (d.scope === "businessType") {
      const known = (BUSINESS_TYPES as readonly string[]).includes(d.targetId);
      return `${t("discounts.scopes.businessType")}: ${known ? t(`pricing.businessTypes.${d.targetId}`) : d.targetId}`;
    }
    const c = customers.find((x) => x._id === d.targetId);
    return `${t("discounts.scopes.customer")}: ${c?.businessName ?? d.targetId.slice(-6)}`;
  }

  function valueLabel(d: DiscountRow) {
    return d.type === "percent" ? `${d.value}%` : `₪${d.value}`;
  }

  function dateRange(d: DiscountRow) {
    const from = d.startsAt ? new Date(d.startsAt).toLocaleDateString(locale) : "—";
    const to = d.endsAt ? new Date(d.endsAt).toLocaleDateString(locale) : "—";
    return `${from} → ${to}`;
  }

  return (
    <div>
      <Link href={`/${locale}/admin/dashboard`} className="admin-back-link">
        ← {t("hub.backToDashboard")}
      </Link>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "0.35rem" }}>{t("discounts.title")}</h1>
      <p style={{ color: "var(--text-muted)", marginBottom: "1.25rem" }}>{t("discounts.subtitle")}</p>

      <div className="admin-toolbar">
        <button type="button" className="admin-btn-primary" onClick={openCreate}>
          + {t("discounts.add")}
        </button>
      </div>

      {error ? <p style={{ color: "var(--danger)", marginBottom: "1rem" }}>{error}</p> : null}

      {loading ? (
        <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "3rem 0" }}>{t("discounts.loading")}</p>
      ) : discounts.length === 0 ? (
        <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "3rem 0" }}>{t("discounts.empty")}</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t("discounts.columns.label")}</th>
                <th>{t("discounts.columns.scope")}</th>
                <th>{t("discounts.columns.value")}</th>
                <th>{t("discounts.columns.products")}</th>
                <th>{t("discounts.columns.window")}</th>
                <th>{t("discounts.columns.status")}</th>
                <th aria-label={t("discounts.columns.actions")} />
              </tr>
            </thead>
            <tbody>
              {discounts.map((d) => (
                <tr key={d.id} style={d.isActive ? undefined : { opacity: 0.55 }}>
                  <td style={{ fontWeight: 600 }}>{d.label || "—"}</td>
                  <td>{scopeLabel(d)}</td>
                  <td>{valueLabel(d)}</td>
                  <td>{d.productIds.length === 0 ? t("discounts.allProducts") : d.productIds.length}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{dateRange(d)}</td>
                  <td>
                    <span className={`admin-stock-badge ${d.isActive ? "admin-stock-badge--low" : "admin-stock-badge--out"}`}>
                      {d.isActive ? t("discounts.active") : t("discounts.inactive")}
                    </span>
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button type="button" className="admin-btn" disabled={busyId === d.id} onClick={() => openEdit(d)}>
                      {t("discounts.edit")}
                    </button>{" "}
                    <button type="button" className="admin-btn" disabled={busyId === d.id} onClick={() => void toggleActive(d)}>
                      {d.isActive ? t("discounts.deactivate") : t("discounts.activate")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {formOpen ? (
        <div className="admin-modal-backdrop" role="dialog" aria-modal="true" aria-label={t("discounts.add")}>
          <div className="admin-modal">
            <h2 style={{ fontSize: "1.15rem", marginBottom: "1rem" }}>
              {form.id ? t("discounts.edit") : t("discounts.add")}
            </h2>

            <label className="admin-field">
              <span>{t("discounts.form.label")}</span>
              <input className="admin-input" value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} />
            </label>

            <label className="admin-field">
              <span>{t("discounts.form.scope")}</span>
              <select
                className="admin-select"
                value={form.scope}
                onChange={(e) => {
                  const scope = e.target.value;
                  setForm((f) => ({ ...f, scope, targetId: "" }));
                  if (scope === "customer") void ensureCustomers();
                }}
              >
                <option value="global">{t("discounts.scopes.global")}</option>
                <option value="businessType">{t("discounts.scopes.businessType")}</option>
                <option value="customer">{t("discounts.scopes.customer")}</option>
              </select>
            </label>

            {form.scope === "businessType" ? (
              <label className="admin-field">
                <span>{t("discounts.form.businessType")}</span>
                <select className="admin-select" value={form.targetId} onChange={(e) => setForm((f) => ({ ...f, targetId: e.target.value }))}>
                  <option value="">—</option>
                  {BUSINESS_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {t(`pricing.businessTypes.${type}`)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {form.scope === "customer" ? (
              <label className="admin-field">
                <span>{t("discounts.form.customer")}</span>
                <select className="admin-select" value={form.targetId} onChange={(e) => setForm((f) => ({ ...f, targetId: e.target.value }))}>
                  <option value="">—</option>
                  {customers.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.businessName} · {c.phoneNumber}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              <label className="admin-field">
                <span>{t("discounts.form.type")}</span>
                <select className="admin-select" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
                  <option value="percent">{t("discounts.types.percent")}</option>
                  <option value="fixed">{t("discounts.types.fixed")}</option>
                </select>
              </label>
              <label className="admin-field">
                <span>{form.type === "percent" ? t("discounts.form.valuePercent") : t("discounts.form.valueFixed")}</span>
                <input
                  className="admin-input"
                  type="number"
                  step="0.5"
                  min="0"
                  value={form.value}
                  onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
                />
              </label>
              <label className="admin-field">
                <span>{t("discounts.form.startsAt")}</span>
                <input className="admin-input" type="date" value={form.startsAt} onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))} />
              </label>
              <label className="admin-field">
                <span>{t("discounts.form.endsAt")}</span>
                <input className="admin-input" type="date" value={form.endsAt} onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))} />
              </label>
            </div>

            <label className="admin-field">
              <span>{t("discounts.form.products")}</span>
              <input
                className="admin-input"
                value={productSearch}
                onChange={(e) => onProductSearch(e.target.value)}
                placeholder={t("discounts.form.productsPlaceholder")}
              />
            </label>
            {productResults.length > 0 ? (
              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 0.5rem", border: "1px solid var(--border)", borderRadius: "8px", maxHeight: "150px", overflowY: "auto" }}>
                {productResults.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className="admin-btn"
                      style={{ display: "block", width: "100%", textAlign: "start", border: "none", borderRadius: 0 }}
                      onClick={() => {
                        setForm((f) =>
                          f.products.some((x) => x.id === p.id) ? f : { ...f, products: [...f.products, p] }
                        );
                        setProductSearch("");
                        setProductResults([]);
                      }}
                    >
                      {p.name} <span dir="ltr" style={{ color: "var(--text-muted)" }}>{p.sku}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {form.products.length > 0 ? (
              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 0.5rem", display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                {form.products.map((p) => (
                  <li key={p.id} className="admin-stock-badge admin-stock-badge--low" style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                    {p.name}
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, products: f.products.filter((x) => x.id !== p.id) }))}
                      style={{ border: "none", background: "none", cursor: "pointer", color: "inherit", fontWeight: 700 }}
                      aria-label={`${t("discounts.form.removeProduct")} — ${p.name}`}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ color: "var(--text-muted)", fontSize: "0.8rem", margin: "0 0 0.5rem" }}>{t("discounts.allProductsHint")}</p>
            )}

            {formError ? <p style={{ color: "var(--danger)", marginTop: "0.5rem" }}>{formError}</p> : null}

            <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.25rem", justifyContent: "flex-end" }}>
              <button type="button" className="admin-btn" disabled={saving} onClick={() => setFormOpen(false)}>
                {t("products.form.cancel")}
              </button>
              <button type="button" className="admin-btn-primary" disabled={saving} onClick={() => void saveForm()}>
                {saving ? t("discounts.form.saving") : t("discounts.form.save")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
