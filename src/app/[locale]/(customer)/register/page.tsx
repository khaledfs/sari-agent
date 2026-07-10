"use client";

import { FormEvent, useState } from "react";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";

import { BUSINESS_ONBOARDING_TYPES, type BusinessOnboardingType } from "@/types/business-type";

type RegisterForm = {
  businessName: string;
  email: string;
  phoneNumber: string;
  password: string;
  confirmPassword: string;
  businessType: BusinessOnboardingType;
};

type RegisterErrors = Partial<Record<keyof RegisterForm, string>>;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_ISRAEL_E164_REGEX = /^\+972\d{8,10}$/;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

function normalizePhoneNumberIsrael(raw: string) {
  const s = raw.trim().replace(/\s+/g, "");
  if (!s) return "";

  if (s.startsWith("+")) {
    return s;
  }

  if (s.startsWith("972")) {
    return `+${s}`;
  }

  if (s.startsWith("0")) {
    return `+972${s.slice(1)}`;
  }

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

  if (!values.businessType.trim()) {
    errors.businessType = t("errors.businessTypeRequired");
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
  const locale = useLocale();
  const router = useRouter();
  const [values, setValues] = useState<RegisterForm>({
    businessName: "",
    email: "",
    phoneNumber: "+972",
    password: "",
    confirmPassword: "",
    businessType: BUSINESS_ONBOARDING_TYPES[0],
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
      businessType: normalizedValues.businessType,
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

      if (response.status === 200 && payload.success === true) {
        try {
          localStorage.setItem(
            "pendingVerificationPhoneNumber",
            normalizedValues.phoneNumber
          );
        } catch {
          // Ignore storage errors
        }
        if (process.env.NODE_ENV === "development") {
          console.info(t("messages.developmentHint"));
        }
        router.push(`/${locale}/verify`);
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
            <span>{t("fields.businessName")}</span>
            <input
              type="text"
              value={values.businessName}
              onChange={(e) => updateField("businessName", e.target.value)}
              placeholder={t("placeholders.businessName")}
            />
            {errors.businessName ? <p className="auth-error">{errors.businessName}</p> : null}
          </label>

          <label>
            <span>{t("fields.email")}</span>
            <input
              type="email"
              value={values.email}
              onChange={(e) => updateField("email", e.target.value)}
              placeholder={t("placeholders.email")}
            />
            {errors.email ? <p className="auth-error">{errors.email}</p> : null}
          </label>

          <label>
            <span>{t("fields.phoneNumber")}</span>
            <input
              type="tel"
              value={values.phoneNumber}
              onChange={(e) => updateField("phoneNumber", e.target.value)}
              placeholder={t("placeholders.phoneNumber")}
            />
            {errors.phoneNumber ? <p className="auth-error">{errors.phoneNumber}</p> : null}
          </label>

          <label>
            <span>{t("fields.businessType")}</span>
            <select
              value={values.businessType}
              onChange={(e) => updateField("businessType", e.target.value as BusinessOnboardingType)}
            >
              {BUSINESS_ONBOARDING_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`options.businessType.${type}`)}
                </option>
              ))}
            </select>
            {errors.businessType ? <p className="auth-error">{errors.businessType}</p> : null}
          </label>

          <label>
            <span>{t("fields.password")}</span>
            <input
              type="password"
              value={values.password}
              onChange={(e) => updateField("password", e.target.value)}
              placeholder={t("placeholders.password")}
            />
            {errors.password ? <p className="auth-error">{errors.password}</p> : null}
          </label>

          <label>
            <span>{t("fields.confirmPassword")}</span>
            <input
              type="password"
              value={values.confirmPassword}
              onChange={(e) => updateField("confirmPassword", e.target.value)}
              placeholder={t("placeholders.confirmPassword")}
            />
            {errors.confirmPassword ? <p className="auth-error">{errors.confirmPassword}</p> : null}
          </label>

          <button type="submit" disabled={isSubmitting} className="auth-submit">
            {isSubmitting ? t("actions.submitting") : t("actions.submit")}
          </button>
        </form>

        {successMessage ? <p className="auth-message-success">{successMessage}</p> : null}
        {apiError ? <p className="auth-message-error">{apiError}</p> : null}

        <p className="auth-footer">
          <Link href={`/${locale}/login`}>{t("links.login") || "Already have an account? Log in"}</Link>
        </p>
      </div>
    </main>
  );
}
