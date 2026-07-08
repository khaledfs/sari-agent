"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";

export default function AdminSettingsPage() {
  const locale = useLocale();
  const t = useTranslations("adminDashboard");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!currentPassword || !newPassword || !confirmNewPassword) {
      setError(t("settings.errors.required"));
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setError(t("settings.errors.mismatch"));
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/admin/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const json = (await res.json()) as { success?: boolean; message?: string };
      if (res.status === 200 && json.success) {
        setSuccess(t("settings.messages.success"));
        setCurrentPassword("");
        setNewPassword("");
        setConfirmNewPassword("");
        return;
      }
      setError(json.message ?? t("settings.messages.genericError"));
    } catch {
      setError(t("settings.messages.networkError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <Link href={`/${locale}/admin/dashboard`} className="admin-back-link">
        ← {t("hub.backToDashboard")}
      </Link>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "0.35rem" }}>{t("settings.title")}</h1>
      <p style={{ color: "var(--text-muted)", marginBottom: "1.5rem" }}>{t("settings.subtitle")}</p>

      <form onSubmit={handleSubmit} style={{ maxWidth: "420px", display: "flex", flexDirection: "column", gap: "1rem" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          <span>{t("settings.fields.currentPassword")}</span>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          <span>{t("settings.fields.newPassword")}</span>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder={t("settings.placeholders.newPassword")}
            autoComplete="new-password"
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          <span>{t("settings.fields.confirmNewPassword")}</span>
          <input
            type="password"
            value={confirmNewPassword}
            onChange={(e) => setConfirmNewPassword(e.target.value)}
            autoComplete="new-password"
          />
        </label>

        {error ? <p style={{ color: "var(--danger)" }}>{error}</p> : null}
        {success ? <p style={{ color: "var(--brand)" }}>{success}</p> : null}

        <button type="submit" disabled={submitting} style={{ alignSelf: "flex-start" }}>
          {submitting ? t("settings.actions.submitting") : t("settings.actions.submit")}
        </button>
      </form>
    </div>
  );
}
