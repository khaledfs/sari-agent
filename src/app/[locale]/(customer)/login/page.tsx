"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

import { LoginForm } from "@/components/login-form";

const sessionCheck = (data: { authenticated?: boolean }) => data.authenticated === true;

export default function CustomerLoginPage() {
  const t = useTranslations("login");
  const locale = useLocale();

  return (
    <LoginForm
      translationNamespace="login"
      apiEndpoint="/api/auth/login"
      dashboardPath="/dashboard"
      sessionCheck={sessionCheck}
      footer={
        <p className="auth-footer">
          <Link href={`/${locale}/register`}>{t("links.register") || "Create an account"}</Link>
        </p>
      }
    />
  );
}
