import { useTranslations } from "next-intl";
import Image from "next/image";

export default function LocalizedHomePage() {
  const t = useTranslations("home");

  return (
    <main className="auth-shell">
      <div className="auth-card" style={{ maxWidth: "540px" }}>
        <Image src="/logo.png" alt="Sari" width={220} height={60} className="auth-logo" style={{ width: "auto", height: "60px" }} priority />
        <h1 className="auth-title">{t("title")}</h1>
        <p className="auth-subtitle">{t("description")}</p>
      </div>
    </main>
  );
}
