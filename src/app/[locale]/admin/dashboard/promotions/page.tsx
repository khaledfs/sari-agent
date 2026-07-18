"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

type PromotionRow = {
  id: string;
  label: string;
  kind: string;
  scope: string;
  targetId: string;
  buyProductId: string | null;
  buyMinQty: number | null;
  giftProductId: string | null;
  giftQty: number | null;
  maxTiers: number | null;
  threshold: number | null;
  discountType: string | null;
  value: number | null;
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
};

type CustomerOption = { id: string; businessName: string; phoneNumber: string };
type ProductOption = { id: string; name: string; sku: string };
type ApiEnvelope<T> = { success?: boolean; data?: T; message?: string };

const BUSINESS_TYPES = ["bakery", "oriental_sweets", "western_sweets", "cafe", "ice_cream"] as const;
const KINDS = ["gift", "orderDiscount", "minOrderGift"] as const;

type FormState = {
  id: string | null;
  label: string;
  kind: string;
  scope: string;
  targetId: string;
  buyProduct: ProductOption | null;
  buyMinQty: string;
  giftProduct: ProductOption | null;
  giftQty: string;
  maxTiers: string;
  threshold: string;
  discountType: string;
  value: string;
  startsAt: string;
  endsAt: string;
};

const EMPTY_FORM: FormState = {
  id: null,
  label: "",
  kind: "gift",
  scope: "global",
  targetId: "",
  buyProduct: null,
  buyMinQty: "1",
  giftProduct: null,
  giftQty: "1",
  maxTiers: "10",
  threshold: "",
  discountType: "percent",
  value: "",
  startsAt: "",
  endsAt: "",
};

function ProductPicker({
  label,
  placeholder,
  selected,
  onSelect,
  onClear,
}: {
  label: string;
  placeholder: string;
  selected: ProductOption | null;
  onSelect: (p: ProductOption) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductOption[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function onChange(value: string) {
    setQuery(value);
    if (timer.current) clearTimeout(timer.current);
    if (!value.trim()) {
      setResults([]);
      return;
    }
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/products?search=${encodeURIComponent(value.trim())}&pageSize=8`);
        const json = (await res.json()) as ApiEnvelope<{ items: ProductOption[] }>;
        setResults(json.data?.items ?? []);
      } catch {
        setResults([]);
      }
    }, 300);
  }

  return (
    <div className="admin-field">
      <span style={{ display: "block", fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>
        {label}
      </span>
      {selected ? (
        <span className="admin-stock-badge admin-stock-badge--low" style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
          {selected.name}
          <button
            type="button"
            onClick={onClear}
            style={{ border: "none", background: "none", cursor: "pointer", color: "inherit", fontWeight: 700 }}
            aria-label={`✕ ${selected.name}`}
          >
            ✕
          </button>
        </span>
      ) : (
        <>
          <input className="admin-input" style={{ inlineSize: "100%" }} value={query} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
          {results.length > 0 ? (
            <ul style={{ listStyle: "none", padding: 0, margin: "0.25rem 0 0", border: "1px solid var(--border)", borderRadius: "8px", maxHeight: "150px", overflowY: "auto" }}>
              {results.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="admin-btn"
                    style={{ display: "block", width: "100%", textAlign: "start", border: "none", borderRadius: 0 }}
                    onClick={() => {
                      onSelect(p);
                      setQuery("");
                      setResults([]);
                    }}
                  >
                    {p.name} <span dir="ltr" style={{ color: "var(--text-muted)" }}>{p.sku}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </div>
  );
}

export default function AdminPromotionsPage() {
  const t = useTranslations("adminDashboard");
  const locale = useLocale();
  const router = useRouter();

  const [promotions, setPromotions] = useState<PromotionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM });
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetch("/api/admin/promotions");
      if (res.status === 401) {
        router.replace(`/${locale}/admin/login`);
        return;
      }
      const json = (await res.json()) as ApiEnvelope<PromotionRow[]>;
      if (res.status === 200 && json.success && json.data) {
        setPromotions(json.data);
        return;
      }
      setError(json.message ?? t("promotions.error"));
    } catch {
      setError(t("promotions.error"));
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
      const json = (await res.json()) as ApiEnvelope<{ items: CustomerOption[] }>;
      if (json.success && json.data?.items) setCustomers(json.data.items);
    } catch {
      // picker stays empty
    }
  }

  function openCreate() {
    setForm({ ...EMPTY_FORM });
    setFormError("");
    setFormOpen(true);
  }

  function openEdit(p: PromotionRow) {
    setForm({
      id: p.id,
      label: p.label,
      kind: p.kind,
      scope: p.scope,
      targetId: p.targetId,
      buyProduct: p.buyProductId ? { id: p.buyProductId, name: p.buyProductId, sku: "" } : null,
      buyMinQty: p.buyMinQty !== null ? String(p.buyMinQty) : "1",
      giftProduct: p.giftProductId ? { id: p.giftProductId, name: p.giftProductId, sku: "" } : null,
      giftQty: p.giftQty !== null ? String(p.giftQty) : "1",
      maxTiers: p.maxTiers !== null ? String(p.maxTiers) : "10",
      threshold: p.threshold !== null ? String(p.threshold) : "",
      discountType: p.discountType ?? "percent",
      value: p.value !== null ? String(p.value) : "",
      startsAt: p.startsAt ? p.startsAt.slice(0, 10) : "",
      endsAt: p.endsAt ? p.endsAt.slice(0, 10) : "",
    });
    setFormError("");
    setFormOpen(true);
    if (p.scope === "customer") void ensureCustomers();
  }

  async function saveForm() {
    setFormError("");
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        label: form.label.trim(),
        kind: form.kind,
        scope: form.scope,
        targetId: form.targetId,
        startsAt: form.startsAt ? new Date(`${form.startsAt}T00:00:00`).toISOString() : null,
        endsAt: form.endsAt ? new Date(`${form.endsAt}T23:59:59`).toISOString() : null,
      };
      if (form.kind === "gift") {
        body.buyProductId = form.buyProduct?.id ?? null;
        body.buyMinQty = Number(form.buyMinQty);
        body.giftProductId = form.giftProduct?.id ?? null;
        body.giftQty = Number(form.giftQty);
        body.maxTiers = Number(form.maxTiers);
      } else if (form.kind === "minOrderGift") {
        body.threshold = Number(form.threshold);
        body.giftProductId = form.giftProduct?.id ?? null;
        body.giftQty = Number(form.giftQty);
      } else {
        body.threshold = Number(form.threshold);
        body.discountType = form.discountType;
        body.value = Number(form.value);
      }
      const res = await fetch(form.id ? `/api/admin/promotions/${form.id}` : "/api/admin/promotions", {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 401) {
        router.replace(`/${locale}/admin/login`);
        return;
      }
      const json = (await res.json()) as ApiEnvelope<PromotionRow>;
      if (res.status === 200 && json.success) {
        setFormOpen(false);
        await load();
        return;
      }
      setFormError(json.message ?? t("promotions.form.saveError"));
    } catch {
      setFormError(t("promotions.form.saveError"));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(p: PromotionRow) {
    setBusyId(p.id);
    setError("");
    try {
      const res = await fetch(`/api/admin/promotions/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !p.isActive }),
      });
      const json = (await res.json()) as ApiEnvelope<PromotionRow>;
      if (res.status === 200 && json.success && json.data) {
        const updated = json.data;
        setPromotions((list) => list.map((x) => (x.id === updated.id ? updated : x)));
        return;
      }
      setError(json.message ?? t("promotions.error"));
    } catch {
      setError(t("promotions.error"));
    } finally {
      setBusyId(null);
    }
  }

  function ruleSummary(p: PromotionRow) {
    if (p.kind === "gift") {
      return t("promotions.rules.gift", {
        minQty: p.buyMinQty ?? 1,
        giftQty: p.giftQty ?? 1,
        maxTiers: p.maxTiers ?? 10,
      });
    }
    if (p.kind === "minOrderGift") {
      return t("promotions.rules.minOrderGift", { threshold: p.threshold ?? 0, giftQty: p.giftQty ?? 1 });
    }
    const valueLabel = p.discountType === "percent" ? `${p.value}%` : `₪${p.value}`;
    return t("promotions.rules.orderDiscount", { threshold: p.threshold ?? 0, value: valueLabel });
  }

  function scopeLabel(p: PromotionRow) {
    if (p.scope === "global") return t("discounts.scopes.global");
    if (p.scope === "businessType") return `${t("discounts.scopes.businessType")}: ${t(`pricing.businessTypes.${p.targetId}`)}`;
    const c = customers.find((x) => x.id === p.targetId);
    return `${t("discounts.scopes.customer")}: ${c?.businessName ?? p.targetId.slice(-6)}`;
  }

  return (
    <div>
      <Link href={`/${locale}/admin/dashboard`} className="admin-back-link">
        ← {t("hub.backToDashboard")}
      </Link>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "0.35rem" }}>{t("promotions.title")}</h1>
      <p style={{ color: "var(--text-muted)", marginBottom: "1.25rem" }}>{t("promotions.subtitle")}</p>

      <div className="admin-toolbar">
        <button type="button" className="admin-btn-primary" onClick={openCreate}>
          + {t("promotions.add")}
        </button>
      </div>

      {error ? <p style={{ color: "var(--danger)", marginBottom: "1rem" }}>{error}</p> : null}

      {loading ? (
        <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "3rem 0" }}>{t("promotions.loading")}</p>
      ) : promotions.length === 0 ? (
        <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "3rem 0" }}>{t("promotions.empty")}</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table admin-table--cards">
            <thead>
              <tr>
                <th>{t("promotions.columns.label")}</th>
                <th>{t("promotions.columns.kind")}</th>
                <th>{t("promotions.columns.rule")}</th>
                <th>{t("discounts.columns.scope")}</th>
                <th>{t("discounts.columns.status")}</th>
                <th aria-label={t("discounts.columns.actions")} />
              </tr>
            </thead>
            <tbody>
              {promotions.map((p) => (
                <tr key={p.id} style={p.isActive ? undefined : { opacity: 0.55 }}>
                  <td className="admin-card-cell--title" style={{ fontWeight: 600 }}>{p.label || "—"}</td>
                  <td data-label={t("promotions.columns.kind")}>{t(`promotions.kinds.${p.kind}`)}</td>
                  <td data-label={t("promotions.columns.rule")} style={{ maxWidth: "280px" }}>{ruleSummary(p)}</td>
                  <td data-label={t("discounts.columns.scope")}>{scopeLabel(p)}</td>
                  <td data-label={t("discounts.columns.status")}>
                    <span className={`admin-stock-badge ${p.isActive ? "admin-stock-badge--low" : "admin-stock-badge--out"}`}>
                      {p.isActive ? t("discounts.active") : t("discounts.inactive")}
                    </span>
                  </td>
                  <td className="admin-card-cell--actions" style={{ whiteSpace: "nowrap" }}>
                    <button type="button" className="admin-btn" disabled={busyId === p.id} onClick={() => openEdit(p)}>
                      {t("discounts.edit")}
                    </button>{" "}
                    <button type="button" className="admin-btn" disabled={busyId === p.id} onClick={() => void toggleActive(p)}>
                      {p.isActive ? t("discounts.deactivate") : t("discounts.activate")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {formOpen ? (
        <div className="admin-modal-backdrop" role="dialog" aria-modal="true" aria-label={t("promotions.add")}>
          <div className="admin-modal">
            <h2 style={{ fontSize: "1.15rem", marginBottom: "1rem" }}>
              {form.id ? t("discounts.edit") : t("promotions.add")}
            </h2>

            <label className="admin-field">
              <span>{t("discounts.form.label")}</span>
              <input className="admin-input" value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} />
            </label>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              <label className="admin-field">
                <span>{t("promotions.columns.kind")}</span>
                <select className="admin-select" value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}>
                  {KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {t(`promotions.kinds.${kind}`)}
                    </option>
                  ))}
                </select>
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
            </div>

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
                    <option key={c.id} value={c.id}>
                      {c.businessName} · {c.phoneNumber}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {form.kind === "gift" ? (
              <>
                <ProductPicker
                  label={t("promotions.form.buyProduct")}
                  placeholder={t("discounts.form.productsPlaceholder")}
                  selected={form.buyProduct}
                  onSelect={(p) => setForm((f) => ({ ...f, buyProduct: p }))}
                  onClear={() => setForm((f) => ({ ...f, buyProduct: null }))}
                />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                  <label className="admin-field">
                    <span>{t("promotions.form.buyMinQty")}</span>
                    <input className="admin-input" type="number" step="1" min="1" value={form.buyMinQty} onChange={(e) => setForm((f) => ({ ...f, buyMinQty: e.target.value }))} />
                  </label>
                  <label className="admin-field">
                    <span>{t("promotions.form.maxTiers")}</span>
                    <input className="admin-input" type="number" step="1" min="1" max="100" value={form.maxTiers} onChange={(e) => setForm((f) => ({ ...f, maxTiers: e.target.value }))} />
                  </label>
                </div>
                <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", margin: "-0.25rem 0 0.5rem" }}>
                  {t("promotions.form.maxTiersHint", {
                    minQty: Number(form.buyMinQty) || 1,
                    giftQty: Number(form.giftQty) || 1,
                    example: (Number(form.buyMinQty) || 1) * 2,
                    exampleGifts: (Number(form.giftQty) || 1) * 2,
                    maxTiers: Number(form.maxTiers) || 10,
                  })}
                </p>
              </>
            ) : null}

            {form.kind !== "gift" ? (
              <label className="admin-field">
                <span>{t("promotions.form.threshold")}</span>
                <input className="admin-input" type="number" step="1" min="1" value={form.threshold} onChange={(e) => setForm((f) => ({ ...f, threshold: e.target.value }))} />
              </label>
            ) : null}

            {form.kind !== "orderDiscount" ? (
              <>
                <ProductPicker
                  label={t("promotions.form.giftProduct")}
                  placeholder={t("discounts.form.productsPlaceholder")}
                  selected={form.giftProduct}
                  onSelect={(p) => setForm((f) => ({ ...f, giftProduct: p }))}
                  onClear={() => setForm((f) => ({ ...f, giftProduct: null }))}
                />
                <label className="admin-field">
                  <span>{t("promotions.form.giftQty")}</span>
                  <input className="admin-input" type="number" step="1" min="1" value={form.giftQty} onChange={(e) => setForm((f) => ({ ...f, giftQty: e.target.value }))} />
                </label>
              </>
            ) : null}

            {form.kind === "orderDiscount" ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <label className="admin-field">
                  <span>{t("discounts.form.type")}</span>
                  <select className="admin-select" value={form.discountType} onChange={(e) => setForm((f) => ({ ...f, discountType: e.target.value }))}>
                    <option value="percent">{t("discounts.types.percent")}</option>
                    <option value="fixed">{t("discounts.types.fixed")}</option>
                  </select>
                </label>
                <label className="admin-field">
                  <span>{form.discountType === "percent" ? t("discounts.form.valuePercent") : t("discounts.form.valueFixed")}</span>
                  <input className="admin-input" type="number" step="0.5" min="0" value={form.value} onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))} />
                </label>
              </div>
            ) : null}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              <label className="admin-field">
                <span>{t("discounts.form.startsAt")}</span>
                <input className="admin-input" type="date" value={form.startsAt} onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))} />
              </label>
              <label className="admin-field">
                <span>{t("discounts.form.endsAt")}</span>
                <input className="admin-input" type="date" value={form.endsAt} onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))} />
              </label>
            </div>

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
