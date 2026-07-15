"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

import { LoginForm } from "@/components/login-form";
import { Meteors } from "@/components/ui/meteors";

const sessionCheck = (data: { authenticated?: boolean }) => data.authenticated === true;

export default function CustomerLoginPage() {
  const t = useTranslations("login");
  const locale = useLocale();

  return (
    <>
      {/* Decorative background layer — behind the auth card (.auth-card is z-index:1). */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute inset-y-0 left-1/2 w-0">
          <Meteors number={20} />
        </div>
      </div>
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
    </>
  );
}
