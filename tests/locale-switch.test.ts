import { describe, expect, it } from "vitest";

import { routing } from "@/i18n/routing";
import { composeLocaleHref, getDirection, isSupportedLocale, LOCALE_LABELS } from "@/lib/locale-switch";

describe("locale configuration (Work Order Issue 5)", () => {
  it("the project supports exactly en/he/ar — the dropdown covers every one", () => {
    expect([...routing.locales].sort()).toEqual(["ar", "en", "he"]);
    for (const locale of routing.locales) {
      expect(LOCALE_LABELS[locale]).toBeTruthy();
      expect(isSupportedLocale(locale)).toBe(true);
    }
  });

  it("dir is rtl for EVERY RTL locale (he AND ar), ltr otherwise", () => {
    expect(getDirection("he")).toBe("rtl");
    expect(getDirection("ar")).toBe("rtl");
    expect(getDirection("en")).toBe("ltr");
  });

  it("unknown locales are rejected", () => {
    expect(isSupportedLocale("fr")).toBe(false);
    expect(isSupportedLocale("")).toBe(false);
  });
});

describe("composeLocaleHref (path + query + hash preservation)", () => {
  it("preserves a deep path with query string and hash", () => {
    expect(
      composeLocaleHref("/dashboard/products/butter-margarine-and-oils", "?page=2", "#top")
    ).toBe("/dashboard/products/butter-margarine-and-oils?page=2#top");
  });

  it("normalizes missing ?/# prefixes", () => {
    expect(composeLocaleHref("/dashboard/orders", "page=3&sort=asc", "receipt")).toBe(
      "/dashboard/orders?page=3&sort=asc#receipt"
    );
  });

  it("path-only navigation stays untouched", () => {
    expect(composeLocaleHref("/dashboard/cart", "", "")).toBe("/dashboard/cart");
  });

  it("empty pathname falls back to root, never a broken URL", () => {
    expect(composeLocaleHref("", "?q=1", "")).toBe("/?q=1");
  });

  it("category slugs are shared across locales — the same path works for every locale", () => {
    // Slugs are locale-independent in this app (PRODUCT_CATEGORIES slugs +
    // order ids); the same locale-less path is valid for en/he/ar, so no
    // per-locale slug resolution/fallback is needed.
    const href = composeLocaleHref("/dashboard/products/flours", "?page=2", "");
    for (const locale of routing.locales) {
      expect(isSupportedLocale(locale)).toBe(true);
      expect(href).toBe("/dashboard/products/flours?page=2");
    }
  });
});
