import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  connectDB: vi.fn(async () => undefined),
}));
vi.mock("@/lib/jwt", () => ({
  signAuthToken: vi.fn(),
  verifyAuthToken: vi.fn(),
}));

import { validatePromotionInput } from "@/lib/admin-promotions";
import {
  DEFAULT_MAX_GIFT_TIERS,
  evaluatePromotions,
  promotionApplies,
  type CartItemInput,
  type PromotionContext,
  type PromotionLike,
} from "@/services/promotions.service";

const USER_ID = "64b000000000000000000001";
const PRODUCT_A = "64a000000000000000000001";
const PRODUCT_B = "64a000000000000000000002";
const GIFT_X = "64a00000000000000000000e";
const GIFT_Y = "64a00000000000000000000f";

const ctx: PromotionContext = {
  userId: USER_ID,
  businessType: "bakery",
  now: new Date("2026-07-15T12:00:00Z"),
};

function giftPromo(id: string, extra: Partial<PromotionLike> = {}): PromotionLike {
  return {
    id,
    kind: "gift",
    scope: "global",
    buyProductId: PRODUCT_A,
    buyMinQty: 5,
    giftProductId: GIFT_X,
    giftQty: 1,
    isActive: true,
    ...extra,
  };
}

function minOrderGiftPromo(id: string, extra: Partial<PromotionLike> = {}): PromotionLike {
  return {
    id,
    kind: "minOrderGift",
    scope: "global",
    threshold: 500,
    giftProductId: GIFT_Y,
    giftQty: 2,
    isActive: true,
    ...extra,
  };
}

function orderDiscountPromo(id: string, extra: Partial<PromotionLike> = {}): PromotionLike {
  return {
    id,
    kind: "orderDiscount",
    scope: "global",
    threshold: 300,
    discountType: "percent",
    value: 10,
    isActive: true,
    ...extra,
  };
}

const cartWithA = (qty: number): CartItemInput[] => [{ productId: PRODUCT_A, quantity: qty }];

describe("gift kind (buy X qty >= N -> gift Y × M)", () => {
  it("threshold met: qty >= buyMinQty earns the gift", () => {
    const result = evaluatePromotions([giftPromo("p1")], cartWithA(5), 100, ctx);
    expect(result.gifts).toEqual([{ productId: GIFT_X, qty: 1, promotionId: "p1", reason: "gift" }]);
    expect(result.appliedPromotionIds).toEqual(["p1"]);
  });

  it("threshold not met: qty < buyMinQty earns nothing", () => {
    const result = evaluatePromotions([giftPromo("p1")], cartWithA(4), 100, ctx);
    expect(result.gifts).toEqual([]);
    expect(result.appliedPromotionIds).toEqual([]);
  });

  it("quantities across duplicate cart lines are summed", () => {
    const items: CartItemInput[] = [
      { productId: PRODUCT_A, quantity: 3 },
      { productId: PRODUCT_A, quantity: 2 },
    ];
    const result = evaluatePromotions([giftPromo("p1")], items, 100, ctx);
    expect(result.gifts).toHaveLength(1);
  });

  it("different trigger product does not qualify", () => {
    const items: CartItemInput[] = [{ productId: PRODUCT_B, quantity: 50 }];
    expect(evaluatePromotions([giftPromo("p1")], items, 100, ctx).gifts).toEqual([]);
  });
});

describe("gift kind — tier multiplication (buy N → gift repeats per full N)", () => {
  const promo10to1 = (extra: Partial<PromotionLike> = {}) =>
    giftPromo("p1", { buyMinQty: 10, giftQty: 1, ...extra });
  const giftQtyFor = (promo: PromotionLike, buyQty: number) =>
    evaluatePromotions([promo], cartWithA(buyQty), 100, ctx).gifts[0]?.qty ?? 0;

  it("multiplies once per full threshold multiple: 10→1, 20→2, 25→2, 30→3", () => {
    expect(giftQtyFor(promo10to1(), 10)).toBe(1);
    expect(giftQtyFor(promo10to1(), 20)).toBe(2);
    expect(giftQtyFor(promo10to1(), 25)).toBe(2);
    expect(giftQtyFor(promo10to1(), 30)).toBe(3);
  });

  it("partial tier earns no extra gift: buy 19 on a 10-promo → 1", () => {
    expect(giftQtyFor(promo10to1(), 19)).toBe(1);
  });

  it("below the first threshold earns nothing", () => {
    expect(evaluatePromotions([promo10to1()], cartWithA(9), 100, ctx).gifts).toEqual([]);
  });

  it("giftQty per tier multiplies too: buy 20 on a 10→2 promo → 4", () => {
    expect(giftQtyFor(promo10to1({ giftQty: 2 }), 20)).toBe(4);
  });

  it("maxTiers caps the repeats: 10→1 cap 5, buy 100 → 5 (not 10)", () => {
    expect(giftQtyFor(promo10to1({ maxTiers: 5 }), 100)).toBe(5);
  });

  it("defaults to DEFAULT_MAX_GIFT_TIERS when maxTiers is unset: buy 1000 on 10→1 → 10", () => {
    expect(giftQtyFor(promo10to1({ maxTiers: null }), 1000)).toBe(DEFAULT_MAX_GIFT_TIERS);
  });

  it("tiers count summed quantities across duplicate cart lines", () => {
    const items: CartItemInput[] = [
      { productId: PRODUCT_A, quantity: 12 },
      { productId: PRODUCT_A, quantity: 8 },
    ]; // 20 total → 2 tiers
    expect(evaluatePromotions([promo10to1()], items, 100, ctx).gifts[0]?.qty).toBe(2);
  });

  it("does not alter unrelated order-discount selection", () => {
    const result = evaluatePromotions(
      [promo10to1(), orderDiscountPromo("p3", { value: 10 })],
      cartWithA(20),
      400,
      ctx
    );
    expect(result.gifts[0]?.qty).toBe(2);
    expect(result.orderDiscount).toMatchObject({ promotionId: "p3", amountOff: 40 });
  });
});

describe("minOrderGift kind", () => {
  it("earns the gift at/above the threshold, nothing below", () => {
    expect(evaluatePromotions([minOrderGiftPromo("p2")], cartWithA(1), 500, ctx).gifts).toHaveLength(1);
    expect(evaluatePromotions([minOrderGiftPromo("p2")], cartWithA(1), 499.99, ctx).gifts).toEqual([]);
  });

  it("below threshold produces a nearest-hint with the remaining amount", () => {
    const result = evaluatePromotions([minOrderGiftPromo("p2")], cartWithA(1), 380, ctx);
    expect(result.nearestHint).toMatchObject({ promotionId: "p2", remaining: 120 });
  });

  it("nearest hint picks the closest threshold among several", () => {
    const result = evaluatePromotions(
      [minOrderGiftPromo("p2", { threshold: 500 }), orderDiscountPromo("p3", { threshold: 400 })],
      cartWithA(1),
      380,
      ctx
    );
    expect(result.nearestHint?.promotionId).toBe("p3");
    expect(result.nearestHint?.remaining).toBe(20);
  });
});

describe("orderDiscount kind", () => {
  it("percent math", () => {
    const result = evaluatePromotions([orderDiscountPromo("p3")], cartWithA(1), 400, ctx);
    expect(result.orderDiscount).toMatchObject({ promotionId: "p3", amountOff: 40 });
  });

  it("fixed math, capped at the subtotal (never negative totals)", () => {
    const promo = orderDiscountPromo("p3", { discountType: "fixed", value: 1000, threshold: 100 });
    const result = evaluatePromotions([promo], cartWithA(1), 300, ctx);
    expect(result.orderDiscount?.amountOff).toBe(300); // not 1000
  });

  it("best-value conflict resolution: single largest amountOff wins, never stacked", () => {
    const percent = orderDiscountPromo("pA", { value: 10 }); // 10% of 400 = 40
    const fixed = orderDiscountPromo("pB", { discountType: "fixed", value: 55 });
    const result = evaluatePromotions([percent, fixed], cartWithA(1), 400, ctx);
    expect(result.orderDiscount?.promotionId).toBe("pB");
    expect(result.orderDiscount?.amountOff).toBe(55);
    expect(result.appliedPromotionIds).toEqual(["pB"]);
  });

  it("below threshold: no discount", () => {
    expect(evaluatePromotions([orderDiscountPromo("p3")], cartWithA(1), 299, ctx).orderDiscount).toBeUndefined();
  });
});

describe("same-gift conflict: larger qty wins, no stacking", () => {
  it("two promotions awarding the same product resolve to the bigger qty", () => {
    const a = giftPromo("p1", { giftQty: 1 });
    const b = minOrderGiftPromo("p2", { giftProductId: GIFT_X, giftQty: 3, threshold: 100 });
    const result = evaluatePromotions([a, b], cartWithA(5), 200, ctx);
    expect(result.gifts).toHaveLength(1);
    expect(result.gifts[0]).toMatchObject({ productId: GIFT_X, qty: 3, promotionId: "p2" });
  });
});

describe("audience filtering + date windows (promotionApplies)", () => {
  it("customer scope only matches the targeted user", () => {
    const p = giftPromo("p1", { scope: "customer", targetId: USER_ID });
    expect(promotionApplies(p, ctx)).toBe(true);
    expect(promotionApplies(p, { ...ctx, userId: "64b000000000000000000099" })).toBe(false);
  });

  it("businessType scope only matches the targeted type", () => {
    const p = giftPromo("p1", { scope: "businessType", targetId: "bakery" });
    expect(promotionApplies(p, ctx)).toBe(true);
    expect(promotionApplies(p, { ...ctx, businessType: "cafe" })).toBe(false);
    expect(promotionApplies(p, { ...ctx, businessType: null })).toBe(false);
  });

  it("inactive and out-of-window promotions never apply", () => {
    const now = ctx.now as Date;
    expect(promotionApplies(giftPromo("p1", { isActive: false }), ctx)).toBe(false);
    expect(promotionApplies(giftPromo("p1", { endsAt: new Date(now.getTime() - 1) }), ctx)).toBe(false);
    expect(promotionApplies(giftPromo("p1", { startsAt: new Date(now.getTime() + 1) }), ctx)).toBe(false);
    expect(promotionApplies(giftPromo("p1", { startsAt: now, endsAt: now }), ctx)).toBe(true);
  });
});

describe("zero/negative-total guards", () => {
  it("zero subtotal earns nothing and produces no negative anything", () => {
    const result = evaluatePromotions(
      [orderDiscountPromo("p3"), minOrderGiftPromo("p2")],
      [],
      0,
      ctx
    );
    expect(result.orderDiscount).toBeUndefined();
    expect(result.gifts).toEqual([]);
  });

  it("deterministic: same input, same output ordering", () => {
    const promos = [minOrderGiftPromo("pZ", { threshold: 100 }), giftPromo("pA")];
    const r1 = evaluatePromotions(promos, cartWithA(5), 200, ctx);
    const r2 = evaluatePromotions([...promos].reverse(), cartWithA(5), 200, ctx);
    expect(r1).toEqual(r2);
  });
});

describe("validatePromotionInput", () => {
  it("gift kind requires products and positive integer quantities", () => {
    expect(() =>
      validatePromotionInput({ kind: "gift", scope: "global", buyProductId: "x", giftProductId: GIFT_X, buyMinQty: 1, giftQty: 1 })
    ).toThrow("Gift promotions need a valid trigger product.");
    expect(() =>
      validatePromotionInput({ kind: "gift", scope: "global", buyProductId: PRODUCT_A, giftProductId: GIFT_X, buyMinQty: 0, giftQty: 1 })
    ).toThrow("buyMinQty must be an integer of at least 1.");
    const doc = validatePromotionInput({
      kind: "gift",
      scope: "global",
      buyProductId: PRODUCT_A,
      giftProductId: GIFT_X,
      buyMinQty: 5,
      giftQty: 2,
    });
    expect(doc).toMatchObject({ kind: "gift", buyMinQty: 5, giftQty: 2, threshold: null });
  });

  it("gift maxTiers: defaults when absent, honored when set, rejected above the cap", () => {
    const base = { kind: "gift", scope: "global", buyProductId: PRODUCT_A, giftProductId: GIFT_X, buyMinQty: 10, giftQty: 1 } as const;
    expect(validatePromotionInput({ ...base }).maxTiers).toBe(DEFAULT_MAX_GIFT_TIERS);
    expect(validatePromotionInput({ ...base, maxTiers: 5 }).maxTiers).toBe(5);
    expect(() => validatePromotionInput({ ...base, maxTiers: 0 })).toThrow("maxTiers must be an integer of at least 1.");
    expect(() => validatePromotionInput({ ...base, maxTiers: 101 })).toThrow("maxTiers cannot exceed 100.");
  });

  it("threshold kinds require threshold > 0", () => {
    expect(() =>
      validatePromotionInput({ kind: "orderDiscount", scope: "global", threshold: 0, discountType: "percent", value: 10 })
    ).toThrow("Threshold must be greater than 0.");
  });

  it("orderDiscount value rules mirror discounts (percent 1-90 / fixed > 0)", () => {
    expect(() =>
      validatePromotionInput({ kind: "orderDiscount", scope: "global", threshold: 100, discountType: "percent", value: 95 })
    ).toThrow("Percent order discounts must be between 1 and 90.");
    expect(() =>
      validatePromotionInput({ kind: "orderDiscount", scope: "global", threshold: 100, discountType: "fixed", value: 0 })
    ).toThrow("Fixed order discounts must be greater than 0.");
  });

  it("date range must be ordered", () => {
    expect(() =>
      validatePromotionInput({
        kind: "minOrderGift",
        scope: "global",
        threshold: 100,
        giftProductId: GIFT_X,
        giftQty: 1,
        startsAt: "2026-08-01T00:00:00Z",
        endsAt: "2026-07-01T00:00:00Z",
      })
    ).toThrow("endsAt must be after startsAt.");
  });

  it("audience validation mirrors discounts", () => {
    expect(() =>
      validatePromotionInput({ kind: "orderDiscount", scope: "customer", targetId: "bad", threshold: 100, discountType: "fixed", value: 5 })
    ).toThrow("Customer-scoped promotions need a valid customer id.");
    expect(() =>
      validatePromotionInput({ kind: "orderDiscount", scope: "businessType", targetId: "petshop", threshold: 100, discountType: "fixed", value: 5 })
    ).toThrow("businessType-scoped promotions need a valid business type.");
  });
});
