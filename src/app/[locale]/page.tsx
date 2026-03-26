import { useTranslations } from "next-intl";

export default function LocalizedHomePage() {
  const t = useTranslations("home");

  return (
    <main className="flex flex-1 items-center justify-center bg-zinc-50 px-6 dark:bg-black">
      <section className="w-full max-w-2xl rounded-xl border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-3xl font-semibold text-zinc-900 dark:text-zinc-100">
          {t("title")}
        </h1>
        <p className="mt-4 text-zinc-600 dark:text-zinc-300">{t("description")}</p>
      </section>
    </main>
  );
}
