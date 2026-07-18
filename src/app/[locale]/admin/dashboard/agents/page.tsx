"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

type AgentRow = {
  id: string;
  businessName: string;
  email: string;
  phoneNumber: string;
  routeLabel: string;
  customerCount: number;
  orders30d: number;
  revenue30d: number;
  lastActivityAt: string | null;
  removed: boolean;
  removedAt: string | null;
};

type RemoveResult = {
  removedAgentId: string;
  reassignedTo: string | null;
  customersReassigned: number;
  openTasksReassigned: number;
};

type ApiEnvelope<T> = { success?: boolean; data?: T; message?: string; code?: string };

/** Admin-only: the field-agent roster (Task D). */
export default function AdminAgentsPage() {
  const t = useTranslations("adminDashboard");
  const locale = useLocale();
  const router = useRouter();

  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ businessName: "", email: "", phoneNumber: "", password: "", routeLabel: "" });
  // Remove-agent flow: the agent pending removal + the reassignment choice.
  const [removeTarget, setRemoveTarget] = useState<AgentRow | null>(null);
  const [reassignTo, setReassignTo] = useState("");
  const [removing, setRemoving] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetch("/api/admin/agents");
      if (res.status === 401) {
        router.replace(`/${locale}/admin/login`);
        return;
      }
      if (res.status === 403) {
        router.replace(`/${locale}/admin/dashboard`);
        return;
      }
      const json = (await res.json()) as ApiEnvelope<AgentRow[]>;
      if (res.status === 200 && json.success && json.data) {
        setAgents(json.data);
        return;
      }
      setError(json.message ?? t("agents.error"));
    } catch {
      setError(t("agents.error"));
    } finally {
      setLoading(false);
    }
  }, [locale, router, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createAgent() {
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/admin/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = (await res.json()) as ApiEnvelope<AgentRow>;
      if (res.status === 200 && json.success) {
        setForm({ businessName: "", email: "", phoneNumber: "", password: "", routeLabel: "" });
        setFormOpen(false);
        await load();
        return;
      }
      setError(json.message ?? t("agents.error"));
    } catch {
      setError(t("agents.error"));
    } finally {
      setCreating(false);
    }
  }

  function openRemove(agent: AgentRow) {
    setError("");
    setReassignTo(""); // default: unassign
    setRemoveTarget(agent);
  }

  async function removeAgent() {
    if (!removeTarget) return;
    setRemoving(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/agents/${removeTarget.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reassignToAgentId: reassignTo || null }),
      });
      const json = (await res.json()) as ApiEnvelope<RemoveResult>;
      if (res.status === 200 && json.success) {
        setRemoveTarget(null);
        await load();
        return;
      }
      setError(json.message ?? t("agents.error"));
    } catch {
      setError(t("agents.error"));
    } finally {
      setRemoving(false);
    }
  }

  // Active agents that can receive a reassignment (never the one being removed).
  const reassignChoices = agents.filter((a) => !a.removed && a.id !== removeTarget?.id);

  function formatDate(iso: string | null) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
    } catch {
      return iso;
    }
  }

  return (
    <div>
      <Link href={`/${locale}/admin/dashboard`} className="admin-back-link">
        ← {t("hub.backToDashboard")}
      </Link>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
        <div>
          <h1 style={{ fontSize: "1.5rem", marginBottom: "0.35rem" }}>{t("agents.title")}</h1>
          <p style={{ color: "var(--text-muted)", marginBottom: "1rem" }}>{t("agents.subtitle")}</p>
        </div>
        <button type="button" className="admin-btn-primary" onClick={() => setFormOpen((v) => !v)}>
          {t("agents.create")}
        </button>
      </div>

      {error ? <p style={{ color: "var(--danger)", marginBottom: "1rem" }}>{error}</p> : null}

      {formOpen ? (
        <div className="admin-panel" style={{ marginBottom: "1.25rem", display: "grid", gap: "0.6rem" }}>
          <label className="admin-field">
            <span>{t("agents.form.name")}</span>
            <input className="admin-input" value={form.businessName} onChange={(e) => setForm((f) => ({ ...f, businessName: e.target.value }))} />
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem" }}>
            <label className="admin-field">
              <span>{t("agents.form.email")}</span>
              <input className="admin-input" dir="ltr" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </label>
            <label className="admin-field">
              <span>{t("agents.form.phone")}</span>
              <input className="admin-input" dir="ltr" value={form.phoneNumber} onChange={(e) => setForm((f) => ({ ...f, phoneNumber: e.target.value }))} />
            </label>
            <label className="admin-field">
              <span>{t("agents.form.password")}</span>
              <input className="admin-input" type="password" dir="ltr" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
            </label>
            <label className="admin-field">
              <span>{t("agents.form.route")}</span>
              <input className="admin-input" value={form.routeLabel} onChange={(e) => setForm((f) => ({ ...f, routeLabel: e.target.value }))} />
            </label>
          </div>
          <div>
            <button type="button" className="admin-btn-primary" disabled={creating} onClick={() => void createAgent()}>
              {creating ? t("agents.form.creating") : t("agents.form.submit")}
            </button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "3rem 0" }}>{t("agents.loading")}</p>
      ) : agents.length === 0 ? (
        <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "3rem 0" }}>{t("agents.empty")}</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table admin-table--cards">
            <thead>
              <tr>
                <th>{t("agents.columns.name")}</th>
                <th>{t("agents.columns.route")}</th>
                <th>{t("agents.columns.customers")}</th>
                <th>{t("agents.columns.orders30d")}</th>
                <th>{t("agents.columns.revenue30d")}</th>
                <th>{t("agents.columns.lastActivity")}</th>
                <th>{t("agents.columns.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((agent) => (
                <tr key={agent.id}>
                  <td className="admin-card-cell--title" style={{ fontWeight: 600 }}>
                    {agent.businessName}
                    {agent.removed ? (
                      <span className="admin-badge admin-badge-danger" style={{ marginInlineStart: "0.5rem" }}>
                        {t("agents.removedBadge")}
                      </span>
                    ) : null}
                    <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontWeight: 400 }} dir="ltr">
                      {agent.phoneNumber} · {agent.email}
                    </div>
                  </td>
                  <td data-label={t("agents.columns.route")}>{agent.routeLabel || "—"}</td>
                  <td data-label={t("agents.columns.customers")}>{agent.customerCount}</td>
                  <td data-label={t("agents.columns.orders30d")}>{agent.orders30d}</td>
                  <td data-label={t("agents.columns.revenue30d")}>₪{agent.revenue30d.toLocaleString(locale)}</td>
                  <td data-label={t("agents.columns.lastActivity")} style={{ whiteSpace: "nowrap" }}>{formatDate(agent.lastActivityAt)}</td>
                  <td data-label={t("agents.columns.actions")} className="admin-card-cell--actions">
                    {agent.removed ? (
                      <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
                        {t("agents.removedOn", { date: formatDate(agent.removedAt) })}
                      </span>
                    ) : (
                      <button type="button" className="admin-btn admin-btn-danger" onClick={() => openRemove(agent)}>
                        {t("agents.remove")}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {removeTarget ? (
        <div className="admin-modal-backdrop" role="dialog" aria-modal="true" aria-label={t("agents.removeModal.title")}>
          <div className="admin-modal">
            <h2 style={{ fontSize: "1.15rem", marginBottom: "0.75rem" }}>{t("agents.removeModal.title")}</h2>
            <p style={{ color: "var(--text-secondary)", marginBottom: "0.75rem" }}>
              {t("agents.removeModal.body", { name: removeTarget.businessName })}
            </p>
            <ul style={{ color: "var(--text-muted)", fontSize: "0.85rem", margin: "0 0 1rem", paddingInlineStart: "1.1rem" }}>
              <li>{t("agents.removeModal.effectAccess")}</li>
              <li>{t("agents.removeModal.effectCustomers", { count: removeTarget.customerCount })}</li>
              <li>{t("agents.removeModal.effectHistory")}</li>
            </ul>

            <label className="admin-field">
              <span>{t("agents.removeModal.reassignLabel")}</span>
              <select className="admin-select" value={reassignTo} onChange={(e) => setReassignTo(e.target.value)}>
                <option value="">{t("agents.removeModal.unassign")}</option>
                {reassignChoices.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.businessName}
                    {a.routeLabel ? ` · ${a.routeLabel}` : ""}
                  </option>
                ))}
              </select>
            </label>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginBlockStart: "0.5rem" }}>
              <button type="button" className="admin-btn" disabled={removing} onClick={() => setRemoveTarget(null)}>
                {t("agents.removeModal.cancel")}
              </button>
              <button type="button" className="admin-btn admin-btn-danger" disabled={removing} onClick={() => void removeAgent()}>
                {removing ? t("agents.removeModal.removing") : t("agents.removeModal.confirm")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
