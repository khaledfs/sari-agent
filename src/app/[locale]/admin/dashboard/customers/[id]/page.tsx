"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import { formatMinorUnits } from "@/lib/money";

import { useConsoleAuth } from "../../admin-auth-context";

type CustomerProfile = {
  customer: {
    id: string;
    businessName: string;
    email: string;
    phoneNumber: string;
    businessType: string | null;
    isVerified: boolean;
    accountStatus: "active" | "restricted";
    restrictedAt: string | null;
    restrictedReason: string;
    assignedAgentId: string | null;
    createdAt: string;
    adminNotes: string;
  };
  analytics: {
    totalOrders: number;
    lifetimeSpend: number;
    avgOrderValue: number;
    lastOrderDate: string | null;
  };
  recentOrders: Array<{
    id: string;
    createdAt: string;
    status: string;
    itemCount: number;
    total: number;
    notes: string;
  }>;
  memory: {
    businessType: string | null;
    memorySummary: string;
    conversationCount: number;
    preferredCategories: string[];
    avoidedProducts: string[];
    notedFacts: string[];
  } | null;
  pricing: {
    overrides: Array<{ productId: string; productName: string; sku: string; basePrice: number; price: number }>;
    discounts: Array<{ id: string; label: string; scope: string; type: string; value: number }>;
  };
  promotions: Array<{ id: string; label: string; kind: string; scope: string }>;
};

type ApiEnvelope<T> = { success?: boolean; data?: T; message?: string };

type LedgerEntry = {
  id: string;
  type: "order_charge" | "payment" | "credit" | "refund" | "adjustment" | "opening_balance";
  orderId: string | null;
  description: string;
  debitMinor: number;
  creditMinor: number;
  status: "posted" | "void";
  createdAt: string;
  balanceAfterMinor: number;
};

type OpenCollection = { taskId: string; orderId: string; orderNumber: string; outstandingMinor: number };

type LedgerData = {
  entries: LedgerEntry[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
  summary: { currentBalanceMinor: number; currency: string; lastEntryAt: string | null };
  openCollections?: OpenCollection[];
};

const TABS = ["overview", "orders", "ledger", "memory", "notes", "pricing"] as const;
type Tab = (typeof TABS)[number];

const ADMIN_LEDGER_TYPES = ["payment", "credit", "adjustment"] as const;

const NOTES_MAX = 1000;

export default function AdminCustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations("adminDashboard");
  const locale = useLocale();
  const router = useRouter();

  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("overview");

  const [notesDraft, setNotesDraft] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ordering-state control (restrict / un-restrict + optional reason).
  const [statusSaving, setStatusSaving] = useState(false);
  const [reasonOpen, setReasonOpen] = useState(false);
  const [reasonDraft, setReasonDraft] = useState("");

  // Agent assignment (Task D) — ADMIN-ONLY control; agents never see it.
  const { role } = useConsoleAuth();
  const [agents, setAgents] = useState<Array<{ id: string; businessName: string }>>([]);
  const [assignSaving, setAssignSaving] = useState(false);

  useEffect(() => {
    if (role !== "admin") return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/agents");
        const json = (await res.json()) as ApiEnvelope<Array<{ id: string; businessName: string }>>;
        if (!cancelled && json.success && json.data) setAgents(json.data);
      } catch {
        // picker stays empty; assignment can still be cleared
      }
    })();
    return () => { cancelled = true; };
  }, [role]);

  async function assignAgent(agentId: string) {
    setAssignSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/customers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignedAgentId: agentId || null }),
      });
      const json = (await res.json()) as ApiEnvelope<CustomerProfile>;
      if (res.status === 200 && json.success && json.data) {
        setProfile(json.data);
        return;
      }
      setError(json.message ?? t("customers.error"));
    } catch {
      setError(t("customers.error"));
    } finally {
      setAssignSaving(false);
    }
  }

  // Ledger tab (Work Order Issue 8).
  const [ledger, setLedger] = useState<LedgerData | null>(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerError, setLedgerError] = useState("");
  const [entryForm, setEntryForm] = useState({
    type: "payment",
    amount: "",
    description: "",
    orderId: "",
    method: "cash" as "cash" | "cheque",
    chequeNumber: "",
    chequeDate: "",
    chequeBank: "",
  });
  const [posting, setPosting] = useState(false);

  const loadLedger = useCallback(async () => {
    setLedgerError("");
    setLedgerLoading(true);
    try {
      const res = await fetch(`/api/admin/customers/${id}/ledger`);
      if (res.status === 401) {
        router.replace(`/${locale}/admin/login`);
        return;
      }
      const json = (await res.json()) as ApiEnvelope<LedgerData>;
      if (res.status === 200 && json.success && json.data) {
        setLedger(json.data);
        return;
      }
      setLedgerError(json.message ?? t("customers.error"));
    } catch {
      setLedgerError(t("customers.error"));
    } finally {
      setLedgerLoading(false);
    }
  }, [id, locale, router, t]);

  useEffect(() => {
    if (tab === "ledger" && !ledger && !ledgerLoading) void loadLedger();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- lazy first load only
  }, [tab]);

  /** Record payment/credit/adjustment with optimistic insert + rollback. */
  async function recordEntry() {
    if (!ledger || posting) return;
    const amount = Number(entryForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setLedgerError(t("customers.ledgerForm.invalid"));
      return;
    }
    const description = entryForm.description.trim();
    const isPayment = entryForm.type === "payment";
    const hasOpenCollections = (ledger.openCollections?.length ?? 0) > 0;
    // A payment while collections are open MUST name the order it settles — this
    // is what makes ledger + collections one money path (no double-count).
    if (isPayment && hasOpenCollections && !entryForm.orderId) {
      setLedgerError(t("customers.ledgerForm.selectOrder"));
      return;
    }
    if (!isPayment && !description) {
      setLedgerError(t("customers.ledgerForm.invalid"));
      return;
    }
    if (isPayment && entryForm.method === "cheque" && (!entryForm.chequeNumber.trim() || !entryForm.chequeDate)) {
      setLedgerError(t("collections.form.chequeRequired"));
      return;
    }
    setPosting(true);
    setLedgerError("");
    const body: Record<string, unknown> = isPayment
      ? {
          type: "payment",
          amount,
          description: description || undefined,
          ...(entryForm.orderId ? { orderId: entryForm.orderId } : {}),
          method: entryForm.method,
          ...(entryForm.method === "cheque"
            ? {
                chequeNumber: entryForm.chequeNumber.trim(),
                chequeDate: new Date(`${entryForm.chequeDate}T00:00:00`).toISOString(),
                chequeBank: entryForm.chequeBank.trim() || undefined,
              }
            : {}),
        }
      : { type: entryForm.type, amount, description };
    try {
      const res = await fetch(`/api/admin/customers/${id}/ledger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as ApiEnvelope<{ entryId: string }>;
      if (res.status === 200 && json.success) {
        setEntryForm((f) => ({ ...f, amount: "", description: "", orderId: "", chequeNumber: "", chequeDate: "", chequeBank: "" }));
        await loadLedger(); // authoritative rows + running balances + open collections
        return;
      }
      setLedgerError(json.message ?? t("customers.error"));
    } catch {
      setLedgerError(t("customers.error"));
    } finally {
      setPosting(false);
    }
  }

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/customers/${id}`);
      if (res.status === 401) {
        router.replace(`/${locale}/admin/login`);
        return;
      }
      const json = (await res.json()) as ApiEnvelope<CustomerProfile>;
      if (res.status === 200 && json.success && json.data) {
        setProfile(json.data);
        setNotesDraft(json.data.customer.adminNotes);
        setReasonDraft(json.data.customer.restrictedReason);
        return;
      }
      setError(json.message ?? t("customers.error"));
    } catch {
      setError(t("customers.error"));
    } finally {
      setLoading(false);
    }
  }, [id, locale, router, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
  }, []);

  /** Auto-save on blur; only adminNotes ever leaves this tab. */
  async function saveNotes() {
    if (!profile || notesDraft === profile.customer.adminNotes) return;
    setNotesSaving(true);
    setNotesSaved(false);
    try {
      const res = await fetch(`/api/admin/customers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminNotes: notesDraft }),
      });
      const json = (await res.json()) as ApiEnvelope<CustomerProfile>;
      if (res.status === 200 && json.success && json.data) {
        setProfile(json.data);
        setNotesSaved(true);
        if (savedTimer.current) clearTimeout(savedTimer.current);
        savedTimer.current = setTimeout(() => setNotesSaved(false), 2500);
        return;
      }
      setError(json.message ?? t("customers.error"));
    } catch {
      setError(t("customers.error"));
    } finally {
      setNotesSaving(false);
    }
  }

  /** Ordering-state control: restrict (with optional reason) / un-restrict. */
  async function setAccountStatus(nextStatus: "active" | "restricted", reason: string) {
    if (!profile) return;
    setStatusSaving(true);
    try {
      const body: Record<string, string> = { accountStatus: nextStatus };
      if (nextStatus === "restricted") body.restrictedReason = reason.trim();
      const res = await fetch(`/api/admin/customers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as ApiEnvelope<CustomerProfile>;
      if (res.status === 200 && json.success && json.data) {
        setProfile(json.data);
        setReasonDraft(json.data.customer.restrictedReason);
        setReasonOpen(false);
        return;
      }
      setError(json.message ?? t("customers.error"));
    } catch {
      setError(t("customers.error"));
    } finally {
      setStatusSaving(false);
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

  const c = profile?.customer;

  return (
    <div>
      <Link href={`/${locale}/admin/dashboard/customers`} className="admin-back-link">
        ← {t("customers.title")}
      </Link>

      {error ? <p style={{ color: "var(--danger)", marginBottom: "1rem" }}>{error}</p> : null}
      {loading ? (
        <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "3rem 0" }}>
          {t("customers.loading")}
        </p>
      ) : null}

      {!loading && profile && c ? (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap", marginBottom: "0.35rem" }}>
            <h1 style={{ fontSize: "1.5rem", margin: 0 }}>{c.businessName}</h1>
            <span className={`admin-stock-badge ${c.accountStatus === "restricted" ? "admin-stock-badge--out" : "admin-stock-badge--low"}`}>
              {c.accountStatus === "restricted" ? t("customers.restricted") : t("customers.active")}
            </span>
            {c.accountStatus === "restricted" ? (
              <button
                type="button"
                className="admin-btn"
                disabled={statusSaving}
                onClick={() => void setAccountStatus("active", "")}
              >
                {statusSaving ? t("customers.statusSaving") : t("customers.unrestrict")}
              </button>
            ) : (
              <button
                type="button"
                className="admin-btn"
                disabled={statusSaving}
                onClick={() => setReasonOpen((v) => !v)}
                aria-expanded={reasonOpen}
              >
                {t("customers.restrict")}
              </button>
            )}
          </div>
          {c.accountStatus === "restricted" ? (
            <p style={{ color: "var(--danger)", fontSize: "0.8rem", marginBottom: "0.5rem" }}>
              {t("customers.restrictedSince")}: {formatDate(c.restrictedAt)}
              {c.restrictedReason ? ` — ${c.restrictedReason}` : ""}
            </p>
          ) : null}
          {role === "admin" ? (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem", flexWrap: "wrap" }}>
              <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>{t("customers.assignedAgent")}:</span>
              <select
                className="admin-select"
                value={c.assignedAgentId ?? ""}
                disabled={assignSaving}
                onChange={(e) => void assignAgent(e.target.value)}
                aria-label={t("customers.assignedAgent")}
              >
                <option value="">{t("customers.noAgent")}</option>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.businessName}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {reasonOpen && c.accountStatus !== "restricted" ? (
            <div style={{ marginBottom: "0.75rem", display: "grid", gap: "0.5rem", maxInlineSize: "480px" }}>
              <textarea
                className="admin-input"
                rows={2}
                maxLength={500}
                value={reasonDraft}
                onChange={(e) => setReasonDraft(e.target.value)}
                placeholder={t("customers.restrictReasonPlaceholder")}
                aria-label={t("customers.restrictReasonPlaceholder")}
              />
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  type="button"
                  className="admin-btn-primary"
                  disabled={statusSaving}
                  onClick={() => void setAccountStatus("restricted", reasonDraft)}
                >
                  {statusSaving ? t("customers.statusSaving") : t("customers.restrictConfirm")}
                </button>
                <button type="button" className="admin-btn" disabled={statusSaving} onClick={() => setReasonOpen(false)}>
                  {t("orders.detail.close")}
                </button>
              </div>
            </div>
          ) : null}
          <p style={{ color: "var(--text-muted)", marginBottom: "1.25rem" }}>
            <span dir="ltr">{c.phoneNumber}</span> · {c.email} ·{" "}
            {c.businessType ? t(`pricing.businessTypes.${c.businessType}`) : "—"} · {t("customers.columns.joined")}:{" "}
            {formatDate(c.createdAt)}
          </p>

          <div className="admin-crm-tabs" role="tablist" aria-label={t("customers.title")}>
            {TABS.map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                className={`admin-btn${tab === key ? " admin-crm-tab--active" : ""}`}
                onClick={() => setTab(key)}
              >
                {t(`customers.tabs.${key}`)}
              </button>
            ))}
          </div>

          {tab === "overview" ? (
            <div className="admin-metric-grid" role="tabpanel">
              <div className="admin-metric-card">
                <span className="admin-metric-card__label">{t("customers.columns.totalOrders")}</span>
                <span className="admin-metric-card__value">{profile.analytics.totalOrders}</span>
              </div>
              <div className="admin-metric-card">
                <span className="admin-metric-card__label">{t("customers.columns.lifetimeSpend")}</span>
                <span className="admin-metric-card__value">₪{profile.analytics.lifetimeSpend.toLocaleString(locale)}</span>
              </div>
              <div className="admin-metric-card">
                <span className="admin-metric-card__label">{t("customers.avgOrder")}</span>
                <span className="admin-metric-card__value">₪{profile.analytics.avgOrderValue.toLocaleString(locale)}</span>
              </div>
              <div className="admin-metric-card">
                <span className="admin-metric-card__label">{t("customers.columns.lastOrder")}</span>
                <span className="admin-metric-card__value" style={{ fontSize: "1rem" }}>
                  {formatDate(profile.analytics.lastOrderDate)}
                </span>
              </div>
            </div>
          ) : null}

          {tab === "orders" ? (
            <div role="tabpanel">
              {profile.recentOrders.length === 0 ? (
                <p className="admin-panel__empty">{t("orders.empty")}</p>
              ) : (
                <div className="admin-table-wrap">
                  <table className="admin-table admin-table--cards">
                    <thead>
                      <tr>
                        <th>{t("orders.columns.date")}</th>
                        <th>{t("orders.columns.items")}</th>
                        <th>{t("orders.columns.total")}</th>
                        <th>{t("orders.columns.status")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {profile.recentOrders.map((o) => (
                        <tr key={o.id}>
                          <td className="admin-card-cell--title" style={{ whiteSpace: "nowrap" }}>
                            {formatDate(o.createdAt)}
                            {o.notes ? (
                              <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>📝 {o.notes}</div>
                            ) : null}
                          </td>
                          <td data-label={t("orders.columns.items")}>{o.itemCount}</td>
                          <td data-label={t("orders.columns.total")}>₪{o.total}</td>
                          <td data-label={t("orders.columns.status")}>{o.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : null}

          {tab === "ledger" ? (
            <div role="tabpanel">
              {ledgerError ? <p style={{ color: "var(--danger)", marginBottom: "0.75rem" }}>{ledgerError}</p> : null}
              {ledgerLoading && !ledger ? (
                <p style={{ color: "var(--text-muted)", padding: "2rem 0", textAlign: "center" }}>
                  {t("customers.loading")}
                </p>
              ) : ledger ? (
                <>
                  <p style={{ marginBottom: "0.75rem", fontSize: "0.95rem" }}>
                    <strong>{t("customers.ledgerBalance")}:</strong>{" "}
                    <span dir="ltr">{formatMinorUnits(locale, ledger.summary.currentBalanceMinor)}</span>
                  </p>

                  <div className="admin-toolbar" style={{ alignItems: "flex-end" }}>
                    <label className="admin-field" style={{ marginBottom: 0 }}>
                      <span>{t("customers.ledgerForm.type")}</span>
                      <select
                        className="admin-select"
                        value={entryForm.type}
                        onChange={(e) => setEntryForm((f) => ({ ...f, type: e.target.value }))}
                      >
                        {ADMIN_LEDGER_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {t(`customers.ledgerTypes.${type}`)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="admin-field" style={{ marginBottom: 0 }}>
                      <span>{t("customers.ledgerForm.amount")}</span>
                      <input
                        className="admin-input"
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={entryForm.amount}
                        onChange={(e) => setEntryForm((f) => ({ ...f, amount: e.target.value }))}
                      />
                    </label>
                    {entryForm.type === "payment" ? (
                      <>
                        {(ledger.openCollections?.length ?? 0) > 0 ? (
                          <label className="admin-field" style={{ marginBottom: 0 }}>
                            <span>{t("customers.ledgerForm.order")}</span>
                            <select
                              className="admin-select"
                              value={entryForm.orderId}
                              onChange={(e) => {
                                const orderId = e.target.value;
                                const outstanding = (ledger.openCollections ?? []).find((c) => c.orderId === orderId)?.outstandingMinor;
                                setEntryForm((f) => ({
                                  ...f,
                                  orderId,
                                  amount: orderId && typeof outstanding === "number" ? (outstanding / 100).toFixed(2) : f.amount,
                                }));
                              }}
                            >
                              <option value="">{t("customers.ledgerForm.selectOrderOption")}</option>
                              {(ledger.openCollections ?? []).map((c) => (
                                <option key={c.orderId} value={c.orderId}>
                                  #{c.orderNumber} · {formatMinorUnits(locale, c.outstandingMinor)}
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : null}
                        <label className="admin-field" style={{ marginBottom: 0 }}>
                          <span>{t("collections.form.method")}</span>
                          <select
                            className="admin-select"
                            value={entryForm.method}
                            onChange={(e) => setEntryForm((f) => ({ ...f, method: e.target.value as "cash" | "cheque" }))}
                          >
                            <option value="cash">{t("collections.form.cash")}</option>
                            <option value="cheque">{t("collections.form.cheque")}</option>
                          </select>
                        </label>
                        {entryForm.method === "cheque" ? (
                          <>
                            <label className="admin-field" style={{ marginBottom: 0 }}>
                              <span>{t("collections.form.chequeNumber")}</span>
                              <input className="admin-input" value={entryForm.chequeNumber} maxLength={60} onChange={(e) => setEntryForm((f) => ({ ...f, chequeNumber: e.target.value }))} />
                            </label>
                            <label className="admin-field" style={{ marginBottom: 0 }}>
                              <span>{t("collections.form.chequeDate")}</span>
                              <input className="admin-input" type="date" value={entryForm.chequeDate} onChange={(e) => setEntryForm((f) => ({ ...f, chequeDate: e.target.value }))} />
                            </label>
                            <label className="admin-field" style={{ marginBottom: 0 }}>
                              <span>{t("collections.form.chequeBank")}</span>
                              <input className="admin-input" value={entryForm.chequeBank} maxLength={120} onChange={(e) => setEntryForm((f) => ({ ...f, chequeBank: e.target.value }))} />
                            </label>
                          </>
                        ) : null}
                      </>
                    ) : null}
                    <label className="admin-field" style={{ marginBottom: 0, flex: 1 }}>
                      <span>{t("customers.ledgerForm.description")}</span>
                      <input
                        className="admin-input"
                        value={entryForm.description}
                        maxLength={500}
                        onChange={(e) => setEntryForm((f) => ({ ...f, description: e.target.value }))}
                      />
                    </label>
                    <button type="button" className="admin-btn-primary" disabled={posting} onClick={() => void recordEntry()}>
                      {posting ? t("customers.ledgerForm.recording") : t("customers.ledgerForm.record")}
                    </button>
                  </div>

                  {ledger.entries.length === 0 ? (
                    <p className="admin-panel__empty">{t("customers.ledgerEmpty")}</p>
                  ) : (
                    <div className="admin-table-wrap">
                      <table className="admin-table admin-table--cards">
                        <thead>
                          <tr>
                            <th>{t("customers.ledgerColumns.date")}</th>
                            <th>{t("customers.ledgerColumns.type")}</th>
                            <th>{t("customers.ledgerColumns.reference")}</th>
                            <th>{t("customers.ledgerColumns.description")}</th>
                            <th>{t("customers.ledgerColumns.debit")}</th>
                            <th>{t("customers.ledgerColumns.credit")}</th>
                            <th>{t("customers.ledgerColumns.balance")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ledger.entries.map((entry) => (
                            <tr key={entry.id}>
                              <td className="admin-card-cell--title" style={{ whiteSpace: "nowrap" }}>{formatDate(entry.createdAt)}</td>
                              <td data-label={t("customers.ledgerColumns.type")}>{t(`customers.ledgerTypes.${entry.type}`)}</td>
                              <td data-label={t("customers.ledgerColumns.reference")} dir="ltr">{entry.orderId ? `#${entry.orderId.slice(-8).toUpperCase()}` : "—"}</td>
                              <td data-label={t("customers.ledgerColumns.description")}>{entry.description}</td>
                              <td data-label={t("customers.ledgerColumns.debit")} dir="ltr">{entry.debitMinor > 0 ? formatMinorUnits(locale, entry.debitMinor) : "—"}</td>
                              <td data-label={t("customers.ledgerColumns.credit")} dir="ltr">{entry.creditMinor > 0 ? formatMinorUnits(locale, entry.creditMinor) : "—"}</td>
                              <td data-label={t("customers.ledgerColumns.balance")} dir="ltr" style={{ fontWeight: 600 }}>
                                {formatMinorUnits(locale, entry.balanceAfterMinor)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              ) : null}
            </div>
          ) : null}

          {tab === "memory" ? (
            <div className="admin-panel" role="tabpanel">
              {profile.memory ? (
                <>
                  <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginTop: 0 }}>
                    {t("customers.memoryReadOnly")} · {profile.memory.conversationCount} 💬
                  </p>
                  <p style={{ whiteSpace: "pre-wrap" }}>{profile.memory.memorySummary || "—"}</p>
                  {profile.memory.preferredCategories.length > 0 ? (
                    <p style={{ fontSize: "0.85rem" }}>
                      <strong>+</strong> {profile.memory.preferredCategories.join(", ")}
                    </p>
                  ) : null}
                  {profile.memory.avoidedProducts.length > 0 ? (
                    <p style={{ fontSize: "0.85rem" }}>
                      <strong>−</strong> {profile.memory.avoidedProducts.join(", ")}
                    </p>
                  ) : null}
                  {profile.memory.notedFacts.length > 0 ? (
                    <ul style={{ fontSize: "0.85rem", paddingInlineStart: "1.2rem" }}>
                      {profile.memory.notedFacts.map((fact, i) => (
                        <li key={i}>{fact}</li>
                      ))}
                    </ul>
                  ) : null}
                </>
              ) : (
                <p className="admin-panel__empty">{t("customers.noMemory")}</p>
              )}
            </div>
          ) : null}

          {tab === "notes" ? (
            <div className="admin-panel" role="tabpanel">
              <label className="admin-field">
                <span>{t("customers.notesLabel")}</span>
                <textarea
                  className="admin-input"
                  style={{ minBlockSize: "140px", resize: "vertical", whiteSpace: "pre-wrap" }}
                  maxLength={NOTES_MAX}
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  onBlur={() => void saveNotes()}
                  aria-label={t("customers.notesLabel")}
                />
              </label>
              <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: "0.25rem 0 0" }} role="status">
                {notesDraft.length}/{NOTES_MAX}
                {notesSaving ? ` · ${t("customers.notesSaving")}` : ""}
                {notesSaved ? ` · ✓ ${t("customers.notesSaved")}` : ""}
              </p>
            </div>
          ) : null}

          {tab === "pricing" ? (
            <div role="tabpanel" className="admin-overview-grid">
              <section className="admin-panel">
                <h2 className="admin-panel__title">{t("customerPricing.overrides")}</h2>
                {profile.pricing.overrides.length === 0 ? (
                  <p className="admin-panel__empty">{t("customerPricing.noOverrides")}</p>
                ) : (
                  <ul className="admin-top-list">
                    {profile.pricing.overrides.map((o) => (
                      <li key={o.productId}>
                        <span className="admin-top-list__name">{o.productName}</span>
                        <span className="admin-top-list__value">
                          <s style={{ color: "var(--text-muted)" }}>₪{o.basePrice}</s> ₪{o.price}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <Link href={`/${locale}/admin/dashboard/products`} className="admin-back-link" style={{ marginTop: "0.5rem" }}>
                  {t("hub.cards.products")} →
                </Link>
              </section>

              <section className="admin-panel">
                <h2 className="admin-panel__title">{t("customerPricing.discounts")}</h2>
                {profile.pricing.discounts.length === 0 ? (
                  <p className="admin-panel__empty">{t("customerPricing.noDiscounts")}</p>
                ) : (
                  <ul className="admin-top-list">
                    {profile.pricing.discounts.map((d) => (
                      <li key={d.id}>
                        <span className="admin-top-list__name">{d.label || t(`discounts.scopes.${d.scope}`)}</span>
                        <span className="admin-top-list__value">{d.type === "percent" ? `${d.value}%` : `₪${d.value}`}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <Link href={`/${locale}/admin/dashboard/discounts`} className="admin-back-link" style={{ marginTop: "0.5rem" }}>
                  {t("discounts.title")} →
                </Link>
              </section>

              <section className="admin-panel">
                <h2 className="admin-panel__title">{t("promotions.title")}</h2>
                {profile.promotions.length === 0 ? (
                  <p className="admin-panel__empty">{t("promotions.empty")}</p>
                ) : (
                  <ul className="admin-top-list">
                    {profile.promotions.map((p) => (
                      <li key={p.id}>
                        <span className="admin-top-list__name">{p.label || t(`promotions.kinds.${p.kind}`)}</span>
                        <span className="admin-top-list__value">{t(`discounts.scopes.${p.scope}`)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <Link href={`/${locale}/admin/dashboard/promotions`} className="admin-back-link" style={{ marginTop: "0.5rem" }}>
                  {t("promotions.title")} →
                </Link>
              </section>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
