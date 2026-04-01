"use client";

import { FormEvent, ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import Image from "next/image";

type LoginFormValues = {
  identifier: string;
  password: string;
};

type LoginFormProps = {
  translationNamespace: string;
  apiEndpoint: string;
  dashboardPath: string;
  sessionCheck: (data: { authenticated?: boolean; payload?: { role?: string } }) => boolean;
  footer?: ReactNode;
};

export function LoginForm({ translationNamespace, apiEndpoint, dashboardPath, sessionCheck, footer }: LoginFormProps) {
  const t = useTranslations(translationNamespace);
  const locale = useLocale();
  const router = useRouter();

  const [values, setValues] = useState<LoginFormValues>({ identifier: "", password: "" });
  const [fieldError, setFieldError] = useState("");
  const [apiError, setApiError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/session", { method: "GET" });
        const json = (await res.json()) as {
          data?: { authenticated?: boolean; payload?: { role?: string } };
        };
        if (json.data && sessionCheck(json.data)) {
          router.replace(`/${locale}${dashboardPath}`);
        }
      } catch {
        // ignore
      }
    })();
  }, [router, locale, dashboardPath, sessionCheck]);

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
      const response = await fetch(apiEndpoint, {
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
        router.replace(`/${locale}${dashboardPath}`);
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

        {footer}
      </div>
    </main>
  );
}
