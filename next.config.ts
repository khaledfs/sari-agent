import os from "node:os";

import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/**
 * Next.js dev blocks HMR / internal `/_next/*` requests unless the browser
 * Origin hostname is allowlisted. When the app is opened via a LAN address
 * (e.g. `http://10.0.0.6:3000` — the "Network:" URL next dev prints), the HMR
 * websocket gets blocked, and the dev client falls back to FORCED FULL PAGE
 * RELOADS — the app looks like it "remounts all the time".
 *
 * Fix: automatically allow every local interface address of this machine in
 * dev (they are all this same computer), plus anything from the optional
 * `ALLOWED_DEV_ORIGINS` env (comma-separated hostnames, no protocol/port) for
 * custom hostnames. Dev-only setting; production ignores allowedDevOrigins.
 */
function localInterfaceHostnames(): string[] {
  const hosts = new Set<string>(["localhost", "127.0.0.1"]);
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === "IPv4") hosts.add(address.address);
    }
  }
  return [...hosts];
}

function parseAllowedDevOrigins(): string[] {
  const fromEnv = (process.env.ALLOWED_DEV_ORIGINS ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set([...localInterfaceHostnames(), ...fromEnv])];
}

const allowedDevOrigins = parseAllowedDevOrigins();

const nextConfig = {
  allowedDevOrigins,
  devIndicators: false,
  experimental: {
    reactDebugChannel: false,
  },
  images: {
    // Product/category photos are hosted on the wholesale site.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "sarihassan.com",
      },
    ],
  },
} satisfies NextConfig;

export default withNextIntl(nextConfig);
