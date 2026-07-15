import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  connectDB: vi.fn(async () => undefined),
}));
vi.mock("@/lib/jwt", () => ({
  signAuthToken: vi.fn(),
  verifyAuthToken: vi.fn(),
}));

import { validateBannerInput } from "@/lib/admin-banners";
import {
  bannerApplies,
  isValidBannerCtaHref,
  selectActiveBanners,
  type BannerAudienceContext,
  type BannerLike,
} from "@/services/banners.service";

const USER_ID = "64b000000000000000000001";

const ctx: BannerAudienceContext = {
  userId: USER_ID,
  businessType: "bakery",
  now: new Date("2026-07-15T12:00:00Z"),
};

function banner(id: string, extra: Partial<BannerLike> = {}): BannerLike {
  return {
    id,
    title: `Banner ${id}`,
    body: "",
    imageUrl: "",
    ctaLabel: "",
    ctaHref: "",
    scope: "global",
    priority: 0,
    isActive: true,
    ...extra,
  };
}

describe("bannerApplies (audience + date windows)", () => {
  it("global applies to everyone", () => {
    expect(bannerApplies(banner("b1"), ctx)).toBe(true);
    expect(bannerApplies(banner("b1"), { userId: null, businessType: null })).toBe(true);
  });

  it("customer scope only matches the targeted user", () => {
    const b = banner("b1", { scope: "customer", targetId: USER_ID });
    expect(bannerApplies(b, ctx)).toBe(true);
    expect(bannerApplies(b, { ...ctx, userId: "64b000000000000000000099" })).toBe(false);
  });

  it("businessType scope only matches the targeted type", () => {
    const b = banner("b1", { scope: "businessType", targetId: "bakery" });
    expect(bannerApplies(b, ctx)).toBe(true);
    expect(bannerApplies(b, { ...ctx, businessType: "cafe" })).toBe(false);
    expect(bannerApplies(b, { ...ctx, businessType: null })).toBe(false);
  });

  it("inactive and out-of-window banners never apply; boundaries inclusive", () => {
    const now = ctx.now as Date;
    expect(bannerApplies(banner("b1", { isActive: false }), ctx)).toBe(false);
    expect(bannerApplies(banner("b1", { endsAt: new Date(now.getTime() - 1) }), ctx)).toBe(false);
    expect(bannerApplies(banner("b1", { startsAt: new Date(now.getTime() + 1) }), ctx)).toBe(false);
    expect(bannerApplies(banner("b1", { startsAt: now, endsAt: now }), ctx)).toBe(true);
  });
});

describe("selectActiveBanners (priority sort + max-3 cap)", () => {
  it("sorts by priority descending", () => {
    const result = selectActiveBanners(
      [banner("b1", { priority: 1 }), banner("b2", { priority: 10 }), banner("b3", { priority: 5 })],
      ctx
    );
    expect(result.map((b) => b.id)).toEqual(["b2", "b3", "b1"]);
  });

  it("caps at 3 banners", () => {
    const many = ["b1", "b2", "b3", "b4", "b5"].map((id, i) => banner(id, { priority: i }));
    expect(selectActiveBanners(many, ctx)).toHaveLength(3);
  });

  it("filters non-applying banners before capping", () => {
    const result = selectActiveBanners(
      [
        banner("b1", { scope: "businessType", targetId: "cafe", priority: 100 }),
        banner("b2", { priority: 1 }),
      ],
      ctx
    );
    expect(result.map((b) => b.id)).toEqual(["b2"]);
  });

  it("deterministic tiebreak by id for equal priority", () => {
    const result = selectActiveBanners([banner("b2"), banner("b1")], ctx);
    expect(result.map((b) => b.id)).toEqual(["b1", "b2"]);
  });
});

describe("ctaHref validation (open-redirect prevention)", () => {
  it.each(["", "/he/dashboard/products", "/en/dashboard"])(
    "accepts internal path %j",
    (href) => {
      expect(isValidBannerCtaHref(href)).toBe(true);
    }
  );

  it.each(["https://evil.example", "//evil.example", "javascript:alert(1)", "dashboard"])(
    "rejects %j",
    (href) => {
      expect(isValidBannerCtaHref(href)).toBe(false);
    }
  );

  it("validateBannerInput enforces it", () => {
    expect(() =>
      validateBannerInput({ title: "x", scope: "global", ctaHref: "https://evil.example" })
    ).toThrow('ctaHref must be an internal path starting with "/".');
    expect(
      validateBannerInput({ title: "x", scope: "global", ctaHref: "/he/dashboard" }).ctaHref
    ).toBe("/he/dashboard");
  });
});

describe("validateBannerInput", () => {
  it("requires a title", () => {
    expect(() => validateBannerInput({ title: "  ", scope: "global" })).toThrow(
      "Banner title is required."
    );
  });

  it("audience validation mirrors discounts/promotions", () => {
    expect(() => validateBannerInput({ title: "x", scope: "customer", targetId: "bad" })).toThrow(
      "Customer-scoped banners need a valid customer id."
    );
    expect(() =>
      validateBannerInput({ title: "x", scope: "businessType", targetId: "petshop" })
    ).toThrow("businessType-scoped banners need a valid business type.");
  });

  it("date range must be ordered", () => {
    expect(() =>
      validateBannerInput({
        title: "x",
        scope: "global",
        startsAt: "2026-08-01T00:00:00Z",
        endsAt: "2026-07-01T00:00:00Z",
      })
    ).toThrow("endsAt must be after startsAt.");
  });
});
