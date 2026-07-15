import { describe, expect, it, vi } from "vitest";

// pricing.service transitively imports @/lib/db (env-validated at import);
// admin-pricing additionally pulls @/lib/jwt. The functions under test are pure.
vi.mock("@/lib/db", () => ({
  connectDB: vi.fn(async () => undefined),
}));
vi.mock("@/lib/jwt", () => ({
  signAuthToken: vi.fn(),
  verifyAuthToken: vi.fn(),
}));

import { validateDiscountInput } from "@/lib/admin-pricing";
import {
  computePriceBreakdown,
  discountApplies,
  priceAfterDiscount,
  selectBestDiscount,
  type DiscountLike,
  type PricingContext,
} from "@/services/pricing.service";

const USER_ID = "64b000000000000000000001";
const OTHER_USER = "64b000000000000000000002";
const PRODUCT_ID = "64a000000000000000000001";

const ctx: PricingContext = {
  userId: USER_ID,
  businessType: "bakery",
  now: new Date("2026-07-15T12:00:00Z"),
};

function percent(value: number, extra: Partial<DiscountLike> = {}): DiscountLike {
  return { id: "d-percent", scope: "global", type: "percent", value, isActive: true, ...extra };
}

function fixed(value: number, extra: Partial<DiscountLike> = {}): DiscountLike {
  return { id: "d-fixed", scope: "global", type: "fixed", value, isActive: true, ...extra };
}

describe("precedence matrix (override > tier > base)", () => {
  it("base only", () => {
    const b = computePriceBreakdown({
      productId: PRODUCT_ID,
      basePrice: 100,
      discounts: [],
      ctx,
    });
    expect(b).toEqual({ base: 100, final: 100 });
  });

  it("tier beats base", () => {
    const b = computePriceBreakdown({
      productId: PRODUCT_ID,
      basePrice: 100,
      tierPrice: 90,
      discounts: [],
      ctx,
    });
    expect(b.final).toBe(90);
    expect(b.tier).toBe(90);
    expect(b.base).toBe(100);
  });

  it("override beats tier and base", () => {
    const b = computePriceBreakdown({
      productId: PRODUCT_ID,
      basePrice: 100,
      tierPrice: 90,
      overridePrice: 80,
      discounts: [],
      ctx,
    });
    expect(b.final).toBe(80);
    expect(b.override).toBe(80);
    expect(b.tier).toBe(90);
  });

  it("with zero pricing data, computed price === base price (regression rule)", () => {
    const b = computePriceBreakdown({
      productId: PRODUCT_ID,
      basePrice: 42.5,
      tierPrice: null,
      overridePrice: null,
      discounts: [],
      ctx: { userId: null, businessType: null },
    });
    expect(b.final).toBe(42.5);
    expect(b.discountApplied).toBeUndefined();
  });
});

describe("discount math", () => {
  it("percent rounds to 2 decimals", () => {
    expect(priceAfterDiscount(9.99, percent(15))).toBe(8.49);
    expect(priceAfterDiscount(33.33, percent(10))).toBe(30);
  });

  it("fixed subtracts and never goes negative", () => {
    expect(priceAfterDiscount(10, fixed(4))).toBe(6);
    expect(priceAfterDiscount(3, fixed(5))).toBe(0);
  });
});

describe("best-single-discount selection (never stacks)", () => {
  it("picks the discount yielding the LOWEST price", () => {
    // On 100: 20% -> 80, fixed 15 -> 85. Percent wins.
    const best = selectBestDiscount(100, [percent(20), fixed(15)], PRODUCT_ID, ctx);
    expect(best?.finalPrice).toBe(80);
    expect(best?.discount.type).toBe("percent");

    // On 10: 20% -> 8, fixed 15 -> 0. Fixed wins.
    const best2 = selectBestDiscount(10, [percent(20), fixed(15)], PRODUCT_ID, ctx);
    expect(best2?.finalPrice).toBe(0);
    expect(best2?.discount.type).toBe("fixed");
  });

  it("applies exactly one discount in the breakdown, on the post-precedence price", () => {
    const b = computePriceBreakdown({
      productId: PRODUCT_ID,
      basePrice: 100,
      overridePrice: 80,
      discounts: [percent(10), percent(5)],
      ctx,
    });
    // 10% off the override price 80 -> 72, NOT stacked with 5%.
    expect(b.final).toBe(72);
    expect(b.discountApplied?.value).toBe(10);
    expect(b.discountApplied?.amountOff).toBe(8);
  });

  it("returns null when nothing applies", () => {
    expect(selectBestDiscount(100, [], PRODUCT_ID, ctx)).toBeNull();
  });
});

describe("discountApplies filtering", () => {
  it("excludes inactive", () => {
    expect(discountApplies(percent(10, { isActive: false }), PRODUCT_ID, ctx)).toBe(false);
  });

  it("excludes expired and not-yet-started; includes boundary instants", () => {
    const now = ctx.now as Date;
    expect(discountApplies(percent(10, { endsAt: new Date(now.getTime() - 1) }), PRODUCT_ID, ctx)).toBe(false);
    expect(discountApplies(percent(10, { startsAt: new Date(now.getTime() + 1) }), PRODUCT_ID, ctx)).toBe(false);
    // Boundary: startsAt === now and endsAt === now are both inclusive.
    expect(discountApplies(percent(10, { startsAt: now, endsAt: now }), PRODUCT_ID, ctx)).toBe(true);
  });

  it("scope customer: only the targeted user", () => {
    const d = percent(10, { scope: "customer", targetId: USER_ID });
    expect(discountApplies(d, PRODUCT_ID, ctx)).toBe(true);
    expect(discountApplies(d, PRODUCT_ID, { ...ctx, userId: OTHER_USER })).toBe(false);
    expect(discountApplies(d, PRODUCT_ID, { ...ctx, userId: null })).toBe(false);
  });

  it("scope businessType: only the targeted type", () => {
    const d = percent(10, { scope: "businessType", targetId: "bakery" });
    expect(discountApplies(d, PRODUCT_ID, ctx)).toBe(true);
    expect(discountApplies(d, PRODUCT_ID, { ...ctx, businessType: "cafe" })).toBe(false);
    expect(discountApplies(d, PRODUCT_ID, { ...ctx, businessType: null })).toBe(false);
  });

  it("productIds: empty = all products, non-empty = listed only", () => {
    expect(discountApplies(percent(10, { productIds: [] }), PRODUCT_ID, ctx)).toBe(true);
    expect(discountApplies(percent(10, { productIds: [PRODUCT_ID] }), PRODUCT_ID, ctx)).toBe(true);
    expect(discountApplies(percent(10, { productIds: [OTHER_USER] }), PRODUCT_ID, ctx)).toBe(false);
  });

  it("rejects out-of-range values (percent outside 1-90, fixed <= 0)", () => {
    expect(discountApplies(percent(0.5), PRODUCT_ID, ctx)).toBe(false);
    expect(discountApplies(percent(95), PRODUCT_ID, ctx)).toBe(false);
    expect(discountApplies(fixed(0), PRODUCT_ID, ctx)).toBe(false);
  });
});

describe("validateDiscountInput", () => {
  const valid = {
    scope: "global",
    type: "percent",
    value: 10,
  };

  it("accepts a valid global percent discount", () => {
    const doc = validateDiscountInput(valid);
    expect(doc.scope).toBe("global");
    expect(doc.targetId).toBe("");
    expect(doc.isActive).toBe(true);
  });

  it.each([0, 0.5, 91, 200])("rejects percent value %d", (value) => {
    expect(() => validateDiscountInput({ ...valid, value })).toThrow(
      "Percent discounts must be between 1 and 90."
    );
  });

  it("rejects fixed <= 0", () => {
    expect(() => validateDiscountInput({ ...valid, type: "fixed", value: 0 })).toThrow(
      "Fixed discounts must be greater than 0."
    );
  });

  it("rejects endsAt <= startsAt", () => {
    expect(() =>
      validateDiscountInput({
        ...valid,
        startsAt: "2026-07-20T00:00:00Z",
        endsAt: "2026-07-10T00:00:00Z",
      })
    ).toThrow("endsAt must be after startsAt.");
  });

  it("requires a valid customer id for customer scope", () => {
    expect(() => validateDiscountInput({ ...valid, scope: "customer", targetId: "nope" })).toThrow(
      "Customer-scoped discounts need a valid customer id."
    );
    expect(
      validateDiscountInput({ ...valid, scope: "customer", targetId: USER_ID }).targetId
    ).toBe(USER_ID);
  });

  it("requires a known businessType for businessType scope", () => {
    expect(() =>
      validateDiscountInput({ ...valid, scope: "businessType", targetId: "pet_shop" })
    ).toThrow("businessType-scoped discounts need a valid business type.");
    expect(
      validateDiscountInput({ ...valid, scope: "businessType", targetId: "bakery" }).targetId
    ).toBe("bakery");
  });

  it("rejects invalid product ids", () => {
    expect(() => validateDiscountInput({ ...valid, productIds: ["xyz"] })).toThrow(
      "Invalid product id in productIds."
    );
  });
});
