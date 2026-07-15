import { isValidObjectId } from "mongoose";

import { connectDB } from "@/lib/db";
import { CustomerMemoryModel } from "@/models/customer-memory.model";
import { PromotionModel, type PromotionKind, type PromotionScope } from "@/models/promotion.model";
import { ProductModel } from "@/models/product.model";
import { round2 } from "@/services/pricing.service";

/**
 * Promotions engine — composes ON TOP of pricing.service: it consumes the
 * already-computed cart subtotal and never re-derives prices. Deterministic:
 * promotions are processed in id order; conflicts resolve to the best value
 * for the customer; totals can never go negative.
 */

export type PromotionLike = {
  id: string;
  kind: PromotionKind;
  label?: string;
  scope: PromotionScope;
  targetId?: string | null;
  buyProductId?: string | null;
  buyMinQty?: number | null;
  giftProductId?: string | null;
  giftQty?: number | null;
  threshold?: number | null;
  discountType?: "percent" | "fixed" | null;
  value?: number | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
  isActive?: boolean;
};

export type CartItemInput = { productId: string; quantity: number };

export type PromotionGift = {
  productId: string;
  qty: number;
  promotionId: string;
  reason: "gift" | "minOrderGift";
};

export type PromotionOrderDiscount = {
  promotionId: string;
  discountType: "percent" | "fixed";
  value: number;
  amountOff: number;
};

/** Threshold promotion the customer has NOT earned yet (for the progress hint). */
export type PromotionHint = {
  promotionId: string;
  kind: PromotionKind;
  label: string;
  remaining: number;
};

export type PromotionEvaluation = {
  gifts: PromotionGift[];
  orderDiscount?: PromotionOrderDiscount;
  appliedPromotionIds: string[];
  /** Nearest unearned threshold promotion, if any. */
  nearestHint?: PromotionHint;
};

export type PromotionContext = {
  userId: string | null;
  businessType: string | null;
  now?: Date;
};

/** Audience + date-window + isActive filter. Pure. */
export function promotionApplies(promotion: PromotionLike, ctx: PromotionContext): boolean {
  if (promotion.isActive === false) return false;

  const now = ctx.now ?? new Date();
  if (promotion.startsAt && now < promotion.startsAt) return false;
  if (promotion.endsAt && now > promotion.endsAt) return false;

  if (promotion.scope === "customer") {
    return Boolean(ctx.userId) && String(promotion.targetId ?? "") === String(ctx.userId);
  }
  if (promotion.scope === "businessType") {
    return Boolean(ctx.businessType) && String(promotion.targetId ?? "") === ctx.businessType;
  }
  return true; // global
}

function giftFromPromotion(p: PromotionLike, reason: "gift" | "minOrderGift"): PromotionGift | null {
  const productId = p.giftProductId ? String(p.giftProductId) : "";
  const qty = Math.floor(Number(p.giftQty ?? 0));
  if (!productId || qty < 1) return null;
  return { productId, qty, promotionId: p.id, reason };
}

function orderDiscountAmount(p: PromotionLike, subtotal: number): number {
  const value = Number(p.value ?? 0);
  if (!(value > 0)) return 0;
  const raw = p.discountType === "percent" ? (subtotal * value) / 100 : value;
  // Never below zero total.
  return round2(Math.min(Math.max(0, raw), subtotal));
}

/**
 * Pure evaluation. Rules:
 * - gift: cart line for buyProductId with quantity >= buyMinQty earns the gift.
 * - minOrderGift: subtotal >= threshold earns the gift.
 * - If two promotions award the SAME gift product, the larger qty wins (no stacking).
 * - orderDiscount: subtotal >= threshold qualifies; the single largest amountOff wins.
 * - Deterministic: promotions processed sorted by id.
 */
export function evaluatePromotions(
  promotions: PromotionLike[],
  cartItems: CartItemInput[],
  subtotal: number,
  ctx: PromotionContext
): PromotionEvaluation {
  const sorted = [...promotions].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const qtyByProduct = new Map<string, number>();
  for (const item of cartItems) {
    const id = String(item.productId);
    qtyByProduct.set(id, (qtyByProduct.get(id) ?? 0) + (Number.isFinite(item.quantity) ? item.quantity : 0));
  }

  const giftByProduct = new Map<string, PromotionGift>();
  let bestOrderDiscount: PromotionOrderDiscount | undefined;
  let nearestHint: PromotionHint | undefined;

  for (const p of sorted) {
    if (!promotionApplies(p, ctx)) continue;

    if (p.kind === "gift") {
      const buyId = p.buyProductId ? String(p.buyProductId) : "";
      const minQty = Math.max(1, Math.floor(Number(p.buyMinQty ?? 1)));
      if (!buyId) continue;
      if ((qtyByProduct.get(buyId) ?? 0) >= minQty) {
        const gift = giftFromPromotion(p, "gift");
        if (gift) {
          const existing = giftByProduct.get(gift.productId);
          if (!existing || gift.qty > existing.qty) giftByProduct.set(gift.productId, gift);
        }
      }
      continue;
    }

    // Threshold kinds.
    const threshold = Number(p.threshold ?? 0);
    if (!(threshold > 0)) continue;

    if (subtotal >= threshold) {
      if (p.kind === "minOrderGift") {
        const gift = giftFromPromotion(p, "minOrderGift");
        if (gift) {
          const existing = giftByProduct.get(gift.productId);
          if (!existing || gift.qty > existing.qty) giftByProduct.set(gift.productId, gift);
        }
      } else if (p.kind === "orderDiscount" && (p.discountType === "percent" || p.discountType === "fixed")) {
        const amountOff = orderDiscountAmount(p, subtotal);
        if (amountOff > 0 && (!bestOrderDiscount || amountOff > bestOrderDiscount.amountOff)) {
          bestOrderDiscount = {
            promotionId: p.id,
            discountType: p.discountType,
            value: Number(p.value ?? 0),
            amountOff,
          };
        }
      }
    } else {
      const remaining = round2(threshold - subtotal);
      if (!nearestHint || remaining < nearestHint.remaining) {
        nearestHint = { promotionId: p.id, kind: p.kind, label: p.label ?? "", remaining };
      }
    }
  }

  const gifts = [...giftByProduct.values()].sort((a, b) =>
    a.promotionId < b.promotionId ? -1 : a.promotionId > b.promotionId ? 1 : 0
  );
  const appliedPromotionIds = [
    ...new Set([...gifts.map((g) => g.promotionId), ...(bestOrderDiscount ? [bestOrderDiscount.promotionId] : [])]),
  ];

  return {
    gifts,
    ...(bestOrderDiscount ? { orderDiscount: bestOrderDiscount } : {}),
    appliedPromotionIds,
    ...(nearestHint ? { nearestHint } : {}),
  };
}

// ---------------------------------------------------------------------------
// DB-backed API
// ---------------------------------------------------------------------------

type PromotionLeanDoc = {
  _id: unknown;
  kind: PromotionKind;
  label?: string;
  scope: PromotionScope;
  targetId?: string;
  buyProductId?: unknown;
  buyMinQty?: number | null;
  giftProductId?: unknown;
  giftQty?: number | null;
  threshold?: number | null;
  discountType?: "percent" | "fixed" | null;
  value?: number | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
  isActive: boolean;
};

export function promotionDocToLike(d: PromotionLeanDoc): PromotionLike {
  return {
    id: String(d._id),
    kind: d.kind,
    label: d.label ?? "",
    scope: d.scope,
    targetId: d.targetId ?? "",
    buyProductId: d.buyProductId ? String(d.buyProductId) : null,
    buyMinQty: d.buyMinQty ?? null,
    giftProductId: d.giftProductId ? String(d.giftProductId) : null,
    giftQty: d.giftQty ?? null,
    threshold: d.threshold ?? null,
    discountType: d.discountType ?? null,
    value: d.value ?? null,
    startsAt: d.startsAt ?? null,
    endsAt: d.endsAt ?? null,
    isActive: d.isActive,
  };
}

async function loadPromotionContext(userId: string): Promise<PromotionContext> {
  const memory = await CustomerMemoryModel.findOne({ userId }).select("businessType").lean().exec();
  return { userId, businessType: memory?.businessType ?? null };
}

async function loadApplicablePromotions(ctx: PromotionContext): Promise<PromotionLike[]> {
  const scopeOr: Array<Record<string, unknown>> = [{ scope: "global" }];
  if (ctx.userId) scopeOr.push({ scope: "customer", targetId: ctx.userId });
  if (ctx.businessType) scopeOr.push({ scope: "businessType", targetId: ctx.businessType });
  const docs = (await PromotionModel.find({ isActive: true, $or: scopeOr })
    .lean()
    .exec()) as unknown as PromotionLeanDoc[];
  return docs.map(promotionDocToLike);
}

/** Evaluates all applicable promotions against the given cart snapshot. */
export async function evaluatePromotionsForCart(
  userId: string,
  cartItems: CartItemInput[],
  subtotal: number
): Promise<PromotionEvaluation> {
  if (!isValidObjectId(userId)) {
    return { gifts: [], appliedPromotionIds: [] };
  }
  await connectDB();
  const ctx = await loadPromotionContext(userId);
  const promotions = await loadApplicablePromotions(ctx);
  return evaluatePromotions(promotions, cartItems, subtotal, ctx);
}

export type GiftPromotionInfo = {
  promotionId: string;
  label: string;
  buyMinQty: number;
  giftQty: number;
  giftProductName: string;
};

/**
 * Read-only lookup for the assistant advisor: is this product the TRIGGER of
 * an active gift promotion for this customer? No LLM math — deterministic data.
 */
export async function getGiftPromotionForProduct(
  userId: string,
  productId: string
): Promise<GiftPromotionInfo | null> {
  if (!isValidObjectId(userId) || !isValidObjectId(productId)) return null;
  await connectDB();
  const ctx = await loadPromotionContext(userId);
  const promotions = await loadApplicablePromotions(ctx);
  const match = promotions.find(
    (p) => p.kind === "gift" && String(p.buyProductId ?? "") === productId && promotionApplies(p, ctx)
  );
  if (!match || !match.giftProductId) return null;

  const gift = await ProductModel.findById(match.giftProductId).select("name").lean().exec();
  return {
    promotionId: match.id,
    label: match.label ?? "",
    buyMinQty: Math.max(1, Math.floor(Number(match.buyMinQty ?? 1))),
    giftQty: Math.max(1, Math.floor(Number(match.giftQty ?? 1))),
    giftProductName: gift?.name ?? "",
  };
}
