"use client";

import { LoginForm } from "@/components/login-form";

const sessionCheck = (data: { authenticated?: boolean; payload?: { role?: string } }) =>
  data.authenticated === true && data.payload?.role === "admin";

export default function AdminLoginPage() {
  return (
    <LoginForm
      translationNamespace="adminLogin"
      apiEndpoint="/api/auth/admin/login"
      dashboardPath="/admin/dashboard"
      sessionCheck={sessionCheck}
    />
  );
}
