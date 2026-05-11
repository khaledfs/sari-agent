"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

type ProductRow = {
  _id: string;
  name: string;
  sku: string;
  category: string;
  price: number;
  unit: string;
  packageSize: string;
  imageUrl: string;
  isActive: boolean;
};

type ProductFormState = {
  name: string;
  sku: string;
  category: string;
  price: string;
  unit: string;
  packageSize: string;
  imageUrl: string;
  isActive: boolean;
};

const EMPTY_FORM: ProductFormState = {
  name: "", sku: "", category: "", price: "", unit: "", packageSize: "", imageUrl: "", isActive: true,
};

export default function AdminProductsPage() {
  const locale = useLocale();
  const t = useTranslations("adminDashboard");

  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // Modal state
  const [modal, setModal] = useState<{ open: boolean; editing: ProductRow | null }>({ open: false, editing: null });
  const [form, setForm] = useState<ProductFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const firstInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/products");
      const json = (await res.json()) as { success: boolean; data?: ProductRow[]; message?: string };
      if (json.success && json.data) {
        setProducts(json.data);
      } else {
        setError(json.message ?? t("products.error"));
      }
    } catch {
      setError(t("products.error"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { void load(); }, [load]);

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 2800);
  }

  function openCreate() {
    setForm(EMPTY_FORM);
    setFormError("");
    setModal({ open: true, editing: null });
    setTimeout(() => firstInputRef.current?.focus(), 50);
  }

  function openEdit(p: ProductRow) {
    setForm({
      name: p.name, sku: p.sku, category: p.category,
      price: String(p.price), unit: p.unit,
      packageSize: p.packageSize, imageUrl: p.imageUrl, isActive: p.isActive,
    });
    setFormError("");
    setModal({ open: true, editing: p });
    setTimeout(() => firstInputRef.current?.focus(), 50);
  }

  function closeModal() {
    setModal({ open: false, editing: null });
    setFormError("");
  }

  async function toggleActive(p: ProductRow) {
    const next = !p.isActive;
    setProducts((prev) => prev.map((x) => x._id === p._id ? { ...x, isActive: next } : x));
    try {
      const res = await fetch(`/api/products/${p._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: next }),
      });
      const json = (await res.json()) as { success: boolean; message?: string };
      if (!json.success) {
        setProducts((prev) => prev.map((x) => x._id === p._id ? { ...x, isActive: !next } : x));
        showToast(json.message ?? t("products.toggleError"), false);
      }
    } catch {
      setProducts((prev) => prev.map((x) => x._id === p._id ? { ...x, isActive: !next } : x));
      showToast(t("products.toggleError"), false);
    }
  }

  async function saveProduct() {
    setFormError("");
    const price = parseFloat(form.price);
    if (!form.name.trim()) { setFormError(t("products.form.name") + " required"); return; }
    if (!form.sku.trim())  { setFormError(t("products.form.sku") + " required"); return; }
    if (!Number.isFinite(price) || price <= 0) { setFormError("Price must be > 0"); return; }

    setSaving(true);
    const payload = {
      name: form.name.trim(),
      sku: form.sku.trim(),
      category: form.category.trim(),
      price,
      unit: form.unit.trim(),
      packageSize: form.packageSize.trim(),
      imageUrl: form.imageUrl.trim(),
      isActive: form.isActive,
    };

    try {
      const isEdit = !!modal.editing;
      const res = await fetch(
        isEdit ? `/api/products/${modal.editing!._id}` : "/api/products",
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const json = (await res.json()) as { success: boolean; data?: ProductRow; message?: string };
      if (json.success && json.data) {
        if (isEdit) {
          setProducts((prev) => prev.map((x) => x._id === modal.editing!._id ? { ...x, ...json.data! } : x));
        } else {
          setProducts((prev) => [json.data!, ...prev]);
        }
        showToast(t("products.saveSuccess"), true);
        closeModal();
      } else {
        setFormError(json.message ?? t("products.saveError"));
      }
    } catch {
      setFormError(t("products.saveError"));
    } finally {
      setSaving(false);
    }
  }

  function field(key: keyof ProductFormState) {
    const onChange = (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));
    return { value: form[key] as string, onChange };
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "0.6rem 0.8rem", borderRadius: "var(--radius)",
    border: "1px solid var(--border-strong)", background: "var(--surface-3)",
    color: "var(--text-primary)", fontSize: "0.9rem", fontFamily: "inherit",
    outline: "none", boxSizing: "border-box",
  };

  return (
    <div>
      {toast ? (
        <div style={{
          position: "fixed", top: "1rem", insetInlineEnd: "1rem", zIndex: 200,
          padding: "0.65rem 1.1rem", borderRadius: "var(--radius-lg)",
          background: toast.ok ? "var(--success-bg)" : "var(--danger-bg)",
          color: toast.ok ? "var(--success)" : "var(--danger)",
          border: `1px solid ${toast.ok ? "rgba(74,158,110,0.3)" : "rgba(192,53,53,0.3)"}`,
          fontSize: "0.875rem", fontWeight: 600, boxShadow: "var(--shadow-md)",
          animation: "auth-card-enter 200ms ease both",
        }}>
          {toast.msg}
        </div>
      ) : null}

      <Link href={`/${locale}/admin/dashboard`} className="admin-back-link">
        ← {t("hub.backToDashboard")}
      </Link>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: "0.75rem" }}>
        <h1 style={{ fontSize: "1.5rem", margin: 0, fontFamily: "var(--font-display, serif)" }}>
          {t("products.title")}
        </h1>
        <button
          onClick={openCreate}
          style={{
            padding: "0.55rem 1.1rem", borderRadius: "var(--radius-pill)",
            border: "1px solid rgba(200,144,47,0.4)",
            background: "linear-gradient(135deg, var(--brand) 0%, var(--brand-hover) 100%)",
            color: "#0c0a08", fontSize: "0.8125rem", fontWeight: 700, cursor: "pointer",
          }}
        >
          + {t("products.addProduct")}
        </button>
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "3rem 0" }}>
          <div className="admin-spinner" />
        </div>
      ) : error ? (
        <p style={{ color: "var(--danger)", textAlign: "center", padding: "2rem 0" }}>{error}</p>
      ) : products.length === 0 ? (
        <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "3rem 0" }}>{t("products.empty")}</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t("products.columns.name")}</th>
                <th>{t("products.columns.sku")}</th>
                <th>{t("products.columns.category")}</th>
                <th style={{ textAlign: "end" }}>{t("products.columns.price")}</th>
                <th>{t("products.columns.unit")}</th>
                <th style={{ textAlign: "center" }}>{t("products.columns.active")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p._id} style={{ opacity: p.isActive ? 1 : 0.5 }}>
                  <td style={{ fontWeight: 600 }}>{p.name}</td>
                  <td>
                    <span style={{ fontFamily: "monospace", fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                      {p.sku}
                    </span>
                  </td>
                  <td style={{ color: "var(--text-secondary)" }}>{p.category || "—"}</td>
                  <td style={{ textAlign: "end", fontWeight: 700, color: "var(--brand-hover)" }}>
                    {p.price.toFixed(2)}
                  </td>
                  <td style={{ color: "var(--text-muted)" }}>{p.unit || "—"}</td>
                  <td style={{ textAlign: "center" }}>
                    <button
                      onClick={() => void toggleActive(p)}
                      title={p.isActive ? t("products.active") : t("products.inactive")}
                      style={{
                        width: "2.2rem", height: "1.3rem", borderRadius: "999px",
                        border: "none", cursor: "pointer", position: "relative",
                        background: p.isActive ? "rgba(74,158,110,0.7)" : "var(--surface-3)",
                        transition: "background 200ms ease",
                      }}
                    >
                      <span style={{
                        position: "absolute", top: "50%", transform: `translateY(-50%) translateX(${p.isActive ? "0.9rem" : "0.2rem"})`,
                        width: "0.9rem", height: "0.9rem", borderRadius: "50%",
                        background: p.isActive ? "#fff" : "var(--text-muted)",
                        transition: "transform 200ms ease, background 200ms ease",
                        display: "block",
                      }} />
                    </button>
                  </td>
                  <td>
                    <button
                      onClick={() => openEdit(p)}
                      style={{
                        padding: "0.28rem 0.65rem", borderRadius: "var(--radius)",
                        border: "1px solid var(--border-strong)", background: "var(--surface-3)",
                        color: "var(--text-secondary)", fontSize: "0.75rem", fontWeight: 600,
                        cursor: "pointer", transition: "all 140ms ease",
                      }}
                    >
                      ✏️
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit Modal */}
      {modal.open ? (
        <div
          role="presentation"
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)",
            backdropFilter: "blur(8px)", zIndex: 150, display: "flex",
            alignItems: "center", justifyContent: "center", padding: "1rem",
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            style={{
              width: "100%", maxWidth: "460px", background: "var(--surface-2)",
              border: "1px solid var(--border-gold)", borderRadius: "var(--radius-xl)",
              padding: "1.75rem 1.5rem", boxShadow: "var(--shadow-lg)",
              animation: "auth-card-enter 220ms cubic-bezier(0.2,0.9,0.25,1) both",
              maxHeight: "90dvh", overflowY: "auto",
            }}
          >
            <h2 style={{ margin: "0 0 1.25rem", fontSize: "1.25rem", fontFamily: "var(--font-display, serif)" }}>
              {modal.editing ? t("products.form.title_edit") : t("products.form.title_create")}
            </h2>

            <div style={{ display: "grid", gap: "0.85rem" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: "0.3rem", fontSize: "0.78rem", fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--text-muted)" }}>
                {t("products.form.name")} *
                <input ref={firstInputRef} style={inputStyle} {...field("name")} />
              </label>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <label style={{ display: "flex", flexDirection: "column", gap: "0.3rem", fontSize: "0.78rem", fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--text-muted)" }}>
                  {t("products.form.sku")} *
                  <input style={inputStyle} {...field("sku")} />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: "0.3rem", fontSize: "0.78rem", fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--text-muted)" }}>
                  {t("products.form.category")}
                  <input style={inputStyle} {...field("category")} />
                </label>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.75rem" }}>
                <label style={{ display: "flex", flexDirection: "column", gap: "0.3rem", fontSize: "0.78rem", fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--text-muted)" }}>
                  {t("products.form.price")} *
                  <input style={inputStyle} type="number" min="0" step="0.01" {...field("price")} />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: "0.3rem", fontSize: "0.78rem", fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--text-muted)" }}>
                  {t("products.form.unit")}
                  <input style={inputStyle} {...field("unit")} />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: "0.3rem", fontSize: "0.78rem", fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--text-muted)" }}>
                  {t("products.form.packageSize")}
                  <input style={inputStyle} {...field("packageSize")} />
                </label>
              </div>

              <label style={{ display: "flex", flexDirection: "column", gap: "0.3rem", fontSize: "0.78rem", fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--text-muted)" }}>
                {t("products.form.imageUrl")}
                <input style={inputStyle} type="url" {...field("imageUrl")} />
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: "0.65rem", cursor: "pointer", fontSize: "0.875rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))}
                  style={{ width: "1rem", height: "1rem", accentColor: "var(--brand)", cursor: "pointer" }}
                />
                {t("products.form.isActive")}
              </label>

              {formError ? (
                <p style={{ color: "var(--danger)", fontSize: "0.8125rem", margin: 0 }}>{formError}</p>
              ) : null}

              <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.25rem" }}>
                <button
                  onClick={() => void saveProduct()}
                  disabled={saving}
                  style={{
                    flex: 1, padding: "0.72rem", borderRadius: "var(--radius-lg)",
                    border: "none", cursor: saving ? "not-allowed" : "pointer",
                    background: "linear-gradient(135deg, var(--brand) 0%, var(--brand-hover) 100%)",
                    color: "#0c0a08", fontWeight: 700, fontSize: "0.875rem",
                    opacity: saving ? 0.6 : 1,
                  }}
                >
                  {saving ? t("products.form.saving") : t("products.form.save")}
                </button>
                <button
                  onClick={closeModal}
                  style={{
                    padding: "0.72rem 1.1rem", borderRadius: "var(--radius-lg)",
                    border: "1px solid var(--border-strong)", background: "var(--surface-3)",
                    color: "var(--text-secondary)", fontWeight: 600, fontSize: "0.875rem", cursor: "pointer",
                  }}
                >
                  {t("products.form.cancel")}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
