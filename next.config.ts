import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/**
 * Next.js dev blocks HMR / internal `/_next/*` requests unless the browser Origin
 * hostname is allowlisted. A lone `*` does NOT work (it is not a valid pattern).
 * When you open the app from another device as `http://<your-pc-lan-ip>:3000`,
 * set `ALLOWED_DEV_ORIGINS` to that hostname (comma-separated, no protocol/port).
 * Example: ALLOWED_DEV_ORIGINS=192.168.1.10
 */
function parseAllowedDevOrigins(): string[] | undefined {
  const raw = process.env.ALLOWED_DEV_ORIGINS;
  if (!raw?.trim()) return undefined;
  const list = raw
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return list.length ? list : undefined;
}

const allowedDevOrigins = parseAllowedDevOrigins();

const nextConfig = {
  ...(allowedDevOrigins ? { allowedDevOrigins } : {}),
  devIndicators: false,
  experimental: {
    reactDebugChannel: false,
  },
} satisfies NextConfig;

export default withNextIntl(nextConfig);
