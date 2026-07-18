import createMiddleware from "next-intl/middleware";

import { routing } from "@/i18n/routing";

/**
 * next-intl locale routing (he / ar / en) — locale-prefix redirects and the
 * NEXT_LOCALE cookie. Migrated from the deprecated `middleware.ts` file
 * convention to Next.js's `proxy.ts` (Next 16, see the proxy file-convention
 * doc under node_modules/next/dist/docs). Behavior is UNCHANGED: the same
 * next-intl handler and the same matcher — only the file convention changed.
 */
const proxy = createMiddleware(routing);

export default proxy;

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
