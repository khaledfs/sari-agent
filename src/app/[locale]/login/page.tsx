"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";

type LoginForm = {
  identifier: string;
  password: string;
};

export default function LoginPage() {
  const t = useTranslations("login");
  const locale = useLocale();
  const router = useRouter();

  const [values, setValues] = useState<LoginForm>({ identifier: "", password: "" });
  const [fieldError, setFieldError] = useState<string>("");
  const [apiError, setApiError] = useState<string>("");
  const [successMessage, setSuccessMessage] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/session", { method: "GET" });
        const json = (await res.json()) as {
          data?: { authenticated?: boolean };
        };
        if (json.data?.authenticated) {
          router.replace(`/${locale}/dashboard`);
        }
      } catch {
        // ignore
      }
    })();
  }, [router, locale]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setApiError("");
    setSuccessMessage("");
    setFieldError("");

    if (!values.identifier.trim() || !values.password) {
      setFieldError(t("errors.required"));
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      const payload = (await response.json()) as { success?: boolean; token?: string; message?: string };

      if (response.status === 200 && payload.success === true && payload.token) {
        try {
          localStorage.setItem("authToken", payload.token);
        } catch {
          // ignore
        }

        setSuccessMessage(t("messages.success"));
        router.replace(`/${locale}/dashboard`);
        return;
      }

      setApiError(payload.message ?? t("messages.genericError"));
    } catch {
      setApiError(t("messages.networkError"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-shell">
      <div className="auth-card">
        <Image src="/logo.png" alt="Sari" width={200} height={56} className="auth-logo" style={{ width: "auto", height: "56px" }} priority />
        <h1 className="auth-title">{t("title")}</h1>
        <p className="auth-subtitle">{t("subtitle") || "\u00A0"}</p>

        <form onSubmit={onSubmit} noValidate className="auth-form">
          <label>
            <span>{t("fields.identifier")}</span>
            <input
              type="text"
              value={values.identifier}
              onChange={(e) => setValues((p) => ({ ...p, identifier: e.target.value }))}
              placeholder={t("placeholders.identifier")}
            />
          </label>

          <label>
            <span>{t("fields.password")}</span>
            <input
              type="password"
              value={values.password}
              onChange={(e) => setValues((p) => ({ ...p, password: e.target.value }))}
              placeholder={t("placeholders.password")}
            />
          </label>

          {fieldError ? <p className="auth-error">{fieldError}</p> : null}

          <button type="submit" disabled={isSubmitting} className="auth-submit">
            {isSubmitting ? t("actions.submitting") : t("actions.submit")}
          </button>
        </form>

        {successMessage ? <p className="auth-message-success">{successMessage}</p> : null}
        {apiError ? <p className="auth-message-error">{apiError}</p> : null}

        <p className="auth-footer">
          <Link href={`/${locale}/register`}>{t("links.register") || "Create an account"}</Link>
        </p>
      </div>
    </main>
  );
}
