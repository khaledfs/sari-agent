import mongoose, { isValidObjectId } from "mongoose";

import { connectDB } from "@/lib/db";
import { CustomerMemoryModel } from "@/models/customer-memory.model";
import { DiscountModel, type DiscountScope, type DiscountType } from "@/models/discount.model";
import { PriceOverrideModel } from "@/models/price-override.model";
import { ProductModel } from "@/models/product.model";

/**
 * Pricing engine — the single source of truth for every price a customer sees
 * or pays. Precedence (highest wins) for the pre-discount price:
 *   1. per-customer override (PriceOverride collection)
 *   2. customer-type tier price (product.tierPrices[businessType])
 *   3. base product price
 * Then the single BEST applicable discount is applied (discounts never stack).
 * With zero pricing data, every computed price === base price (regression rule).
 */

export type DiscountApplied = {
  discountId: string;
  discountType: DiscountType;
  value: number;
  amountOff: number;
};

export type PriceBreakdown = {
  base: number;
  tier?: number;
  override?: number;
  discountApplied?: DiscountApplied;
  final: number;
};

/** Discount shape the pure engine consumes (model doc or plain test object). */
export type DiscountLike = {
  id: string;
  scope: DiscountScope;
  targetId?: string | null;
  type: DiscountType;
  value: number;
  /** Empty/missing = applies to all products. */
  productIds?: string[];
  startsAt?: Date | null;
  endsAt?: Date | null;
  isActive?: boolean;
};

export type PricingContext = {
  userId: string | null;
  businessType: string | null;
  now?: Date;
};

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Date-window + scope + product filter for one discount. Pure. */
export function discountApplies(
  discount: DiscountLike,
  productId: string,
  ctx: PricingContext
): boolean {
  if (discount.isActive === false) return false;

  const now = ctx.now ?? new Date();
  if (discount.startsAt && now < discount.startsAt) return false;
  if (discount.endsAt && now > discount.endsAt) return false;

  if (discount.scope === "customer") {
    if (!ctx.userId || String(discount.targetId ?? "") !== String(ctx.userId)) return false;
  } else if (discount.scope === "businessType") {
    if (!ctx.businessType || String(discount.targetId ?? "") !== ctx.businessType) return false;
  }
  // scope === "global": everyone.

  const ids = discount.productIds ?? [];
  if (ids.length > 0 && !ids.map(String).includes(String(productId))) return false;

  if (discount.type === "percent") {
    return discount.value >= 1 && discount.value <= 90;
  }
  return discount.value > 0;
}

/** Price after one discount; 2-decimal rounding; never below 0. Pure. */
export function priceAfterDiscount(price: number, discount: DiscountLike): number {
  const next =
    discount.type === "percent" ? price * (1 - discount.value / 100) : price - discount.value;
  return Math.max(0, round2(next));
}

/** Picks the single discount giving the LOWEST price. Pure. */
export function selectBestDiscount(
  price: number,
  discounts: DiscountLike[],
  productId: string,
  ctx: PricingContext
): { discount: DiscountLike; finalPrice: number } | null {
  let best: { discount: DiscountLike; finalPrice: number } | null = null;
  for (const discount of discounts) {
    if (!discountApplies(discount, productId, ctx)) continue;
    const finalPrice = priceAfterDiscount(price, discount);
    if (!best || finalPrice < best.finalPrice) {
      best = { discount, finalPrice };
    }
  }
  return best;
}

/** Full breakdown for one product. Pure — all data passed in. */
export function computePriceBreakdown(input: {
  productId: string;
  basePrice: number;
  tierPrice?: number | null;
  overridePrice?: number | null;
  discounts: DiscountLike[];
  ctx: PricingContext;
}): PriceBreakdown {
  const base = round2(input.basePrice);
  const breakdown: PriceBreakdown = { base, final: base };

  const tier =
    typeof input.tierPrice === "number" && input.tierPrice > 0 ? round2(input.tierPrice) : undefined;
  const override =
    typeof input.overridePrice === "number" && input.overridePrice > 0
      ? round2(input.overridePrice)
      : undefined;

  if (tier !== undefined) breakdown.tier = tier;
  if (override !== undefined) breakdown.override = override;

  // Precedence: override > tier > base.
  const preDiscount = override ?? tier ?? base;
  breakdown.final = preDiscount;

  const best = selectBestDiscount(preDiscount, input.discounts, input.productId, input.ctx);
  if (best) {
    breakdown.discountApplied = {
      discountId: best.discount.id,
      discountType: best.discount.type,
      value: best.discount.value,
      amountOff: round2(preDiscount - best.finalPrice),
    };
    breakdown.final = best.finalPrice;
  }

  return breakdown;
}

// ---------------------------------------------------------------------------
// DB-backed API — one round trip per collection, no N+1.
// ---------------------------------------------------------------------------

type ProductPricingLean = {
  _id: mongoose.Types.ObjectId;
  price: number;
  tierPrices?: Map<string, number> | Record<string, number> | null;
};

function tierPriceFor(product: ProductPricingLean, businessType: string | null): number | null {
  if (!businessType || !product.tierPrices) return null;
  const raw =
    product.tierPrices instanceof Map
      ? product.tierPrices.get(businessType)
      : (product.tierPrices as Record<string, number>)[businessType];
  return typeof raw === "number" && raw > 0 ? raw : null;
}

async function getBusinessTypeForUser(userId: string): Promise<string | null> {
  const memory = await CustomerMemoryModel.findOne({ userId })
    .select("businessType")
    .lean()
    .exec();
  return memory?.businessType ?? null;
}

async function loadApplicableDiscounts(
  userId: string,
  businessType: string | null
): Promise<DiscountLike[]> {
  const scopeOr: Array<Record<string, unknown>> = [
    { scope: "global" },
    { scope: "customer", targetId: userId },
  ];
  if (businessType) scopeOr.push({ scope: "businessType", targetId: businessType });

  const docs = await DiscountModel.find({ isActive: true, $or: scopeOr }).lean().exec();
  return docs.map((d) => ({
    id: String(d._id),
    scope: d.scope as DiscountScope,
    targetId: d.targetId ?? "",
    type: d.type as DiscountType,
    value: d.value,
    productIds: (d.productIds ?? []).map(String),
    startsAt: d.startsAt ?? null,
    endsAt: d.endsAt ?? null,
    isActive: d.isActive,
  }));
}

/**
 * Batch pricing for already-loaded products (avoids re-fetching when the
 * caller — cart service, products API — already has the documents).
 * userId null (unauthenticated) → base prices, no personalization.
 */
export async function computePricesForProducts(
  products: ProductPricingLean[],
  userId: string | null
): Promise<Map<string, PriceBreakdown>> {
  const result = new Map<string, PriceBreakdown>();
  if (products.length === 0) return result;

  if (!userId || !isValidObjectId(userId)) {
    for (const p of products) {
      result.set(String(p._id), computePriceBreakdown({
        productId: String(p._id),
        basePrice: p.price,
        discounts: [],
        ctx: { userId: null, businessType: null },
      }));
    }
    return result;
  }

  await connectDB();
  const productIds = products.map((p) => p._id);

  // One round per collection: memory, overrides, discounts.
  const businessType = await getBusinessTypeForUser(userId);
  const [overrides, discounts] = await Promise.all([
    PriceOverrideModel.find({ userId, productId: { $in: productIds } }).lean().exec(),
    loadApplicableDiscounts(userId, businessType),
  ]);

  const overrideByProduct = new Map(overrides.map((o) => [String(o.productId), o.price]));
  const ctx: PricingContext = { userId, businessType };

  for (const p of products) {
    const pid = String(p._id);
    result.set(
      pid,
      computePriceBreakdown({
        productId: pid,
        basePrice: p.price,
        tierPrice: tierPriceFor(p, businessType),
        overridePrice: overrideByProduct.get(pid) ?? null,
        discounts,
        ctx,
      })
    );
  }
  return result;
}

/** Batch variant by ids — one DB round per collection. */
export async function getPricesForCustomer(
  productIds: string[],
  userId: string | null
): Promise<Map<string, PriceBreakdown>> {
  const validIds = productIds.filter((id) => isValidObjectId(id));
  if (validIds.length === 0) return new Map();
  await connectDB();
  const products = (await ProductModel.find({ _id: { $in: validIds } })
    .select("price tierPrices")
    .lean()
    .exec()) as unknown as ProductPricingLean[];
  return computePricesForProducts(products, userId);
}

/** Single-product variant. */
export async function getPriceForCustomer(
  productOrId: string | ProductPricingLean,
  userId: string | null
): Promise<PriceBreakdown | null> {
  if (typeof productOrId !== "string") {
    const map = await computePricesForProducts([productOrId], userId);
    return map.get(String(productOrId._id)) ?? null;
  }
  const map = await getPricesForCustomer([productOrId], userId);
  return map.get(productOrId) ?? null;
}
