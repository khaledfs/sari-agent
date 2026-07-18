"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

type BannerRow = {
  id: string;
  title: string;
  body: string;
  imageUrl: string;
  ctaLabel: string;
  ctaHref: string;
  scope: string;
  targetId: string;
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
  priority: number;
};

type CustomerOption = { id: string; businessName: string; phoneNumber: string };
type ApiEnvelope<T> = { success?: boolean; data?: T; message?: string };

const BUSINESS_TYPES = ["bakery", "oriental_sweets", "western_sweets", "cafe", "ice_cream"] as const;

type FormState = {
  id: string | null;
  title: string;
  body: string;
  imageUrl: string;
  ctaLabel: string;
  ctaHref: string;
  scope: string;
  targetId: string;
  startsAt: string;
  endsAt: string;
  priority: string;
};

const EMPTY_FORM: FormState = {
  id: null,
  title: "",
  body: "",
  imageUrl: "",
  ctaLabel: "",
  ctaHref: "",
  scope: "global",
  targetId: "",
  startsAt: "",
  endsAt: "",
  priority: "0",
};

export default function AdminBannersPage() {
  const t = useTranslations("adminDashboard");
  const locale = useLocale();
  const router = useRouter();

  const [banners, setBanners] = useState<BannerRow[]>([]);
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
      const res = await fetch("/api/admin/banners");
      if (res.status === 401) {
        router.replace(`/${locale}/admin/login`);
        return;
      }
      const json = (await res.json()) as ApiEnvelope<BannerRow[]>;
      if (res.status === 200 && json.success && json.data) {
        setBanners(json.data);
        return;
      }
      setError(json.message ?? t("banners.error"));
    } catch {
      setError(t("banners.error"));
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

  function openEdit(b: BannerRow) {
    setForm({
      id: b.id,
      title: b.title,
      body: b.body,
      imageUrl: b.imageUrl,
      ctaLabel: b.ctaLabel,
      ctaHref: b.ctaHref,
      scope: b.scope,
      targetId: b.targetId,
      startsAt: b.startsAt ? b.startsAt.slice(0, 10) : "",
      endsAt: b.endsAt ? b.endsAt.slice(0, 10) : "",
      priority: String(b.priority),
    });
    setFormError("");
    setFormOpen(true);
    if (b.scope === "customer") void ensureCustomers();
  }

  async function saveForm() {
    setFormError("");
    setSaving(true);
    try {
      const body = {
        title: form.title.trim(),
        body: form.body.trim(),
        imageUrl: form.imageUrl.trim(),
        ctaLabel: form.ctaLabel.trim(),
        ctaHref: form.ctaHref.trim(),
        scope: form.scope,
        targetId: form.targetId,
        startsAt: form.startsAt ? new Date(`${form.startsAt}T00:00:00`).toISOString() : null,
        endsAt: form.endsAt ? new Date(`${form.endsAt}T23:59:59`).toISOString() : null,
        priority: Number(form.priority) || 0,
      };
      const res = await fetch(form.id ? `/api/admin/banners/${form.id}` : "/api/admin/banners", {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 401) {
        router.replace(`/${locale}/admin/login`);
        return;
      }
      const json = (await res.json()) as ApiEnvelope<BannerRow>;
      if (res.status === 200 && json.success) {
        setFormOpen(false);
        await load();
        return;
      }
      setFormError(json.message ?? t("banners.form.saveError"));
    } catch {
      setFormError(t("banners.form.saveError"));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(b: BannerRow) {
    setBusyId(b.id);
    setError("");
    try {
      const res = await fetch(`/api/admin/banners/${b.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !b.isActive }),
      });
      const json = (await res.json()) as ApiEnvelope<BannerRow>;
      if (res.status === 200 && json.success && json.data) {
        const updated = json.data;
        setBanners((list) => list.map((x) => (x.id === updated.id ? updated : x)));
        return;
      }
      setError(json.message ?? t("banners.error"));
    } catch {
      setError(t("banners.error"));
    } finally {
      setBusyId(null);
    }
  }

  function scopeLabel(b: BannerRow) {
    if (b.scope === "global") return t("discounts.scopes.global");
    if (b.scope === "businessType") return `${t("discounts.scopes.businessType")}: ${t(`pricing.businessTypes.${b.targetId}`)}`;
    const c = customers.find((x) => x.id === b.targetId);
    return `${t("discounts.scopes.customer")}: ${c?.businessName ?? b.targetId.slice(-6)}`;
  }

  return (
    <div>
      <Link href={`/${locale}/admin/dashboard`} className="admin-back-link">
        ← {t("hub.backToDashboard")}
      </Link>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "0.35rem" }}>{t("banners.title")}</h1>
      <p style={{ color: "var(--text-muted)", marginBottom: "1.25rem" }}>{t("banners.subtitle")}</p>

      <div className="admin-toolbar">
        <button type="button" className="admin-btn-primary" onClick={openCreate}>
          + {t("banners.add")}
        </button>
      </div>

      {error ? <p style={{ color: "var(--danger)", marginBottom: "1rem" }}>{error}</p> : null}

      {loading ? (
        <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "3rem 0" }}>{t("banners.loading")}</p>
      ) : banners.length === 0 ? (
        <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "3rem 0" }}>{t("banners.empty")}</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table admin-table--cards">
            <thead>
              <tr>
                <th>{t("banners.columns.title")}</th>
                <th>{t("discounts.columns.scope")}</th>
                <th>{t("banners.columns.priority")}</th>
                <th>{t("discounts.columns.window")}</th>
                <th>{t("discounts.columns.status")}</th>
                <th aria-label={t("discounts.columns.actions")} />
              </tr>
            </thead>
            <tbody>
              {banners.map((b) => (
                <tr key={b.id} style={b.isActive ? undefined : { opacity: 0.55 }}>
                  <td className="admin-card-cell--title" style={{ fontWeight: 600 }}>
                    {b.title}
                    {b.body ? (
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 400 }}>{b.body}</div>
                    ) : null}
                  </td>
                  <td data-label={t("discounts.columns.scope")}>{scopeLabel(b)}</td>
                  <td data-label={t("banners.columns.priority")}>{b.priority}</td>
                  <td data-label={t("discounts.columns.window")} style={{ whiteSpace: "nowrap" }}>
                    {(b.startsAt ? new Date(b.startsAt).toLocaleDateString(locale) : "—") +
                      " → " +
                      (b.endsAt ? new Date(b.endsAt).toLocaleDateString(locale) : "—")}
                  </td>
                  <td data-label={t("discounts.columns.status")}>
                    <span className={`admin-stock-badge ${b.isActive ? "admin-stock-badge--low" : "admin-stock-badge--out"}`}>
                      {b.isActive ? t("discounts.active") : t("discounts.inactive")}
                    </span>
                  </td>
                  <td className="admin-card-cell--actions" style={{ whiteSpace: "nowrap" }}>
                    <button type="button" className="admin-btn" disabled={busyId === b.id} onClick={() => openEdit(b)}>
                      {t("discounts.edit")}
                    </button>{" "}
                    <button type="button" className="admin-btn" disabled={busyId === b.id} onClick={() => void toggleActive(b)}>
                      {b.isActive ? t("discounts.deactivate") : t("discounts.activate")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {formOpen ? (
        <div className="admin-modal-backdrop" role="dialog" aria-modal="true" aria-label={t("banners.add")}>
          <div className="admin-modal" style={{ maxInlineSize: "560px" }}>
            <h2 style={{ fontSize: "1.15rem", marginBottom: "1rem" }}>
              {form.id ? t("discounts.edit") : t("banners.add")}
            </h2>

            <label className="admin-field">
              <span>{t("banners.form.title")}</span>
              <input className="admin-input" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            </label>
            <label className="admin-field">
              <span>{t("banners.form.body")}</span>
              <input className="admin-input" value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} />
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              <label className="admin-field">
                <span>{t("banners.form.ctaLabel")}</span>
                <input className="admin-input" value={form.ctaLabel} onChange={(e) => setForm((f) => ({ ...f, ctaLabel: e.target.value }))} />
              </label>
              <label className="admin-field">
                <span>{t("banners.form.ctaHref")}</span>
                <input
                  className="admin-input"
                  dir="ltr"
                  value={form.ctaHref}
                  placeholder="/he/dashboard/products"
                  onChange={(e) => setForm((f) => ({ ...f, ctaHref: e.target.value }))}
                />
              </label>
            </div>
            <label className="admin-field">
              <span>{t("banners.form.imageUrl")}</span>
              <input className="admin-input" dir="ltr" value={form.imageUrl} onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))} />
            </label>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
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
              <label className="admin-field">
                <span>{t("banners.form.priority")}</span>
                <input className="admin-input" type="number" step="1" value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))} />
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

            <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", margin: "0.75rem 0 0.35rem" }}>
              {t("banners.form.preview")}
            </p>
            <div className="ds-banner" style={{ animation: "none" }}>
              {form.imageUrl.trim() ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="ds-banner__img" src={form.imageUrl.trim()} alt="" />
              ) : (
                <span className="ds-banner__icon" aria-hidden="true">
                  📣
                </span>
              )}
              <div className="ds-banner__text">
                <p className="ds-banner__title">{form.title.trim() || t("banners.form.previewTitle")}</p>
                {form.body.trim() ? <p className="ds-banner__body">{form.body.trim()}</p> : null}
              </div>
              {form.ctaLabel.trim() ? <span className="ds-banner__cta">{form.ctaLabel.trim()}</span> : null}
              <span className="ds-banner__dismiss" aria-hidden="true">
                ✕
              </span>
            </div>

            {formError ? <p style={{ color: "var(--danger)", marginTop: "0.75rem" }}>{formError}</p> : null}

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
