"use client";

import { FormEvent, useState } from "react";
import { useTranslations } from "next-intl";

type RegisterForm = {
  businessName: string;
  email: string;
  phoneNumber: string;
  password: string;
  confirmPassword: string;
};

type RegisterErrors = Partial<Record<keyof RegisterForm, string>>;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Israel country code: +972
const PHONE_ISRAEL_E164_REGEX = /^\+972\d{8,10}$/;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

function normalizePhoneNumberIsrael(raw: string) {
  const s = raw.trim().replace(/\s+/g, "");
  if (!s) return "";

  if (s.startsWith("+")) {
    // If already international, keep as-is (we will validate it below).
    return s;
  }

  if (s.startsWith("972")) {
    return `+${s}`;
  }

  // Common local formatting: mobile/landline starts with `0`, e.g. 0523456789 -> +972523456789
  if (s.startsWith("0")) {
    return `+972${s.slice(1)}`;
  }

  // Fallback: assume missing country code and prepend +972
  return `+972${s}`;
}

function validateRegisterForm(values: RegisterForm, t: ReturnType<typeof useTranslations>) {
  const errors: RegisterErrors = {};

  if (!values.businessName.trim()) {
    errors.businessName = t("errors.businessNameRequired");
  }

  if (!values.email.trim()) {
    errors.email = t("errors.emailRequired");
  } else if (!EMAIL_REGEX.test(values.email.trim())) {
    errors.email = t("errors.emailInvalid");
  }

  if (!values.phoneNumber.trim()) {
    errors.phoneNumber = t("errors.phoneRequired");
  } else if (!PHONE_ISRAEL_E164_REGEX.test(values.phoneNumber.trim())) {
    errors.phoneNumber = t("errors.phoneInvalid");
  }

  if (!values.password) {
    errors.password = t("errors.passwordRequired");
  } else if (!PASSWORD_REGEX.test(values.password)) {
    errors.password = t("errors.passwordInvalid");
  }

  if (!values.confirmPassword) {
    errors.confirmPassword = t("errors.confirmPasswordRequired");
  } else if (values.password !== values.confirmPassword) {
    errors.confirmPassword = t("errors.confirmPasswordMismatch");
  }

  return errors;
}

export default function RegisterPage() {
  const t = useTranslations("register");
  const [values, setValues] = useState<RegisterForm>({
    businessName: "",
    email: "",
    phoneNumber: "+972",
    password: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState<RegisterErrors>({});
  const [apiError, setApiError] = useState<string>("");
  const [successMessage, setSuccessMessage] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateField<K extends keyof RegisterForm>(field: K, value: RegisterForm[K]) {
    setValues((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setApiError("");
    setSuccessMessage("");

    const normalizedPhoneNumber = normalizePhoneNumberIsrael(values.phoneNumber);
    const normalizedValues: RegisterForm = { ...values, phoneNumber: normalizedPhoneNumber };

    const nextErrors = validateRegisterForm(normalizedValues, t);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    const registerPayload = {
      businessName: normalizedValues.businessName,
      email: normalizedValues.email,
      phoneNumber: normalizedValues.phoneNumber,
      password: normalizedValues.password,
    };

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(registerPayload),
      });

      const payload = (await response.json()) as {
        success?: boolean;
        message?: string;
      };

      // Runtime check: require both HTTP 200 and {success: true}
      if (response.status === 200 && payload.success === true) {
        setSuccessMessage(t("messages.success"));
        try {
          localStorage.setItem(
            "pendingVerificationPhoneNumber",
            normalizedValues.phoneNumber
          );
        } catch {
          // Ignore storage errors (privacy mode, blocked storage, etc.)
        }
        if (process.env.NODE_ENV === "development") {
          console.info(t("messages.developmentHint"));
        }
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
    <main style={{ padding: "1.5rem", maxWidth: "520px", margin: "0 auto", width: "100%" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1rem" }}>
        {t("title")}
      </h1>

      <form onSubmit={onSubmit} noValidate style={{ display: "grid", gap: "0.75rem" }}>
        <label>
          <span>{t("fields.businessName")}</span>
          <input
            type="text"
            value={values.businessName}
            onChange={(e) => updateField("businessName", e.target.value)}
            placeholder={t("placeholders.businessName")}
            style={{ display: "block", width: "100%", padding: "0.5rem", marginTop: "0.25rem" }}
          />
          {errors.businessName ? <small style={{ color: "crimson" }}>{errors.businessName}</small> : null}
        </label>

        <label>
          <span>{t("fields.email")}</span>
          <input
            type="email"
            value={values.email}
            onChange={(e) => updateField("email", e.target.value)}
            placeholder={t("placeholders.email")}
            style={{ display: "block", width: "100%", padding: "0.5rem", marginTop: "0.25rem" }}
          />
          {errors.email ? <small style={{ color: "crimson" }}>{errors.email}</small> : null}
        </label>

        <label>
          <span>{t("fields.phoneNumber")}</span>
          <input
            type="tel"
            value={values.phoneNumber}
            onChange={(e) => updateField("phoneNumber", e.target.value)}
            placeholder={t("placeholders.phoneNumber")}
            style={{ display: "block", width: "100%", padding: "0.5rem", marginTop: "0.25rem" }}
          />
          {errors.phoneNumber ? <small style={{ color: "crimson" }}>{errors.phoneNumber}</small> : null}
        </label>

        <label>
          <span>{t("fields.password")}</span>
          <input
            type="password"
            value={values.password}
            onChange={(e) => updateField("password", e.target.value)}
            placeholder={t("placeholders.password")}
            style={{ display: "block", width: "100%", padding: "0.5rem", marginTop: "0.25rem" }}
          />
          {errors.password ? <small style={{ color: "crimson" }}>{errors.password}</small> : null}
        </label>

        <label>
          <span>{t("fields.confirmPassword")}</span>
          <input
            type="password"
            value={values.confirmPassword}
            onChange={(e) => updateField("confirmPassword", e.target.value)}
            placeholder={t("placeholders.confirmPassword")}
            style={{ display: "block", width: "100%", padding: "0.5rem", marginTop: "0.25rem" }}
          />
          {errors.confirmPassword ? (
            <small style={{ color: "crimson" }}>{errors.confirmPassword}</small>
          ) : null}
        </label>

        <button type="submit" disabled={isSubmitting} style={{ padding: "0.65rem 1rem" }}>
          {isSubmitting ? t("actions.submitting") : t("actions.submit")}
        </button>
      </form>

      {successMessage ? (
        <p style={{ marginTop: "1rem", color: "green" }}>{successMessage}</p>
      ) : null}

      {apiError ? <p style={{ marginTop: "1rem", color: "crimson" }}>{apiError}</p> : null}
    </main>
  );
}
