"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

type LoginForm = {
  identifier: string;
  password: string;
};

export default function LoginPage() {
  const t = useTranslations("login");
  const router = useRouter();

  const [values, setValues] = useState<LoginForm>({ identifier: "", password: "" });
  const [fieldError, setFieldError] = useState<string>("");
  const [apiError, setApiError] = useState<string>("");
  const [successMessage, setSuccessMessage] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    // If we already have a valid cookie-session, go to dashboard
    (async () => {
      try {
        const res = await fetch("/api/auth/session", { method: "GET" });
        const json = (await res.json()) as { authenticated?: boolean };
        if (json.authenticated) {
          router.replace("./dashboard");
        }
      } catch {
        // ignore
      }
    })();
  }, [router]);

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

      // Runtime checks
      if (response.status === 200 && payload.success === true && payload.token) {
        try {
          localStorage.setItem("authToken", payload.token);
        } catch {
          // ignore
        }

        setSuccessMessage(t("messages.success"));
        router.replace("./dashboard");
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
    <main style={{ padding: "1.25rem", maxWidth: "520px", margin: "0 auto", width: "100%" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1rem" }}>{t("title")}</h1>

      <form onSubmit={onSubmit} noValidate style={{ display: "grid", gap: "0.75rem" }}>
        <label>
          <span>{t("fields.identifier")}</span>
          <input
            type="text"
            value={values.identifier}
            onChange={(e) => setValues((p) => ({ ...p, identifier: e.target.value }))}
            placeholder={t("placeholders.identifier")}
            style={{ display: "block", width: "100%", padding: "0.6rem", marginTop: "0.25rem" }}
          />
        </label>

        <label>
          <span>{t("fields.password")}</span>
          <input
            type="password"
            value={values.password}
            onChange={(e) => setValues((p) => ({ ...p, password: e.target.value }))}
            placeholder={t("placeholders.password")}
            style={{ display: "block", width: "100%", padding: "0.6rem", marginTop: "0.25rem" }}
          />
        </label>

        {fieldError ? <small style={{ color: "crimson" }}>{fieldError}</small> : null}

        <button
          type="submit"
          disabled={isSubmitting}
          style={{
            padding: "0.75rem 1rem",
            width: "100%",
            maxWidth: "520px",
          }}
        >
          {isSubmitting ? t("actions.submitting") : t("actions.submit")}
        </button>
      </form>

      {successMessage ? <p style={{ marginTop: "1rem", color: "green" }}>{successMessage}</p> : null}
      {apiError ? <p style={{ marginTop: "1rem", color: "crimson" }}>{apiError}</p> : null}
    </main>
  );
}

