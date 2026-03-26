import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getMessages } from "next-intl/server";
import { notFound } from "next/navigation";

import { routing } from "@/i18n/routing";
import { SessionBootstrap } from "@/app/[locale]/SessionBootstrap";

function getDirection(locale: string) {
  return locale === "he" || locale === "ar" ? "rtl" : "ltr";
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  const messages = await getMessages({ locale });
  const dir = getDirection(locale);

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <div lang={locale} dir={dir} className="flex min-h-full flex-1">
        <SessionBootstrap locale={locale} />
        {children}
      </div>
    </NextIntlClientProvider>
  );
}
