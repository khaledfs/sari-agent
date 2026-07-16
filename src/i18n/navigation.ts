import { createNavigation } from "next-intl/navigation";

import { routing } from "@/i18n/routing";

/**
 * next-intl's locale-aware navigation APIs (Work Order Issue 5). usePathname
 * returns the path WITHOUT the locale prefix and router.replace(path,
 * { locale }) swaps ONLY the locale segment — no manual string surgery.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
