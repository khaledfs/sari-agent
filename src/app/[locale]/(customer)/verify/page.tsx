"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import Image from "next/image";

type VerifyForm = {
  verificationCode: string;
};

const CODE_REGEX = /^\d{6}$/;

function normalizeCode(raw: string) {
  return raw.replace(/\s+/g, "");
}

export default function VerifyPage() {
  const t = useTranslations("verify");
  const searchParams = useSearchParams();

  const [phoneNumber, setPhoneNumber] = useState<string>("");
  const [values, setValues] = useState<VerifyForm>({ verificationCode: "" });
  const [fieldError, setFieldError] = useState<string>("");
  const [apiError, setApiError] = useState<string>("");
  const [successMessage, setSuccessMessage] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const fromQuery = searchParams.get("phoneNumber") ?? "";
    if (fromQuery) {
      setPhoneNumber(fromQuery);
      return;
    }

    try {
      const stored = localStorage.getItem("pendingVerificationPhoneNumber") ?? "";
      if (stored) setPhoneNumber(stored);
    } catch {
      // Ignore
    }
  }, [searchParams]);

  const canSubmit = useMemo(() => Boolean(phoneNumber) && !isSubmitting, [phoneNumber, isSubmitting]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setApiError("");
    setSuccessMessage("");
    setFieldError("");

    if (!phoneNumber) {
      setApiError(t("messages.missingPhoneNumber"));
      return;
    }

    const code = normalizeCode(values.verificationCode);
    if (!code) {
      setFieldError(t("errors.codeRequired"));
      return;
    }
    if (!CODE_REGEX.test(code)) {
      setFieldError(t("errors.codeInvalid"));
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber, code }),
      });

      const payload = (await response.json()) as { success?: boolean; message?: string };

      if (response.status === 200 && payload.success === true) {
        setSuccessMessage(t("messages.success"));
        if (process.env.NODE_ENV === "development") {
          console.info(t("messages.developmentHint"));
        }
        return;
      }

      setApiError(payload.message ?? t("messages.genericError"));
      if (process.env.NODE_ENV === "development") {
        console.warn("[verify] failed", { status: response.status, payload });
      }
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
            <span>{t("fields.verificationCode")}</span>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\\d{6}"
              type="text"
              value={values.verificationCode}
              onChange={(e) => {
                setValues({ verificationCode: e.target.value });
                setFieldError("");
              }}
              placeholder={t("placeholders.verificationCode")}
            />
            {fieldError ? <p className="auth-error">{fieldError}</p> : null}
          </label>

          <button type="submit" disabled={!canSubmit} className="auth-submit">
            {isSubmitting ? t("actions.submitting") : t("actions.submit")}
          </button>
        </form>

        {successMessage ? <p className="auth-message-success">{successMessage}</p> : null}
        {apiError ? <p className="auth-message-error">{apiError}</p> : null}
      </div>
    </main>
  );
}
