import mongoose, { isValidObjectId } from "mongoose";

import { requireAdmin } from "@/lib/auth-user";
import { connectDB } from "@/lib/db";
import { CUSTOMER_MEMORY_BUSINESS_TYPES } from "@/models/customer-memory.model";
import { PROMOTION_KINDS, PROMOTION_SCOPES, PromotionModel } from "@/models/promotion.model";

/** Admin CRUD + validation for promotions (gift / orderDiscount / minOrderGift). */

export type AdminPromotionRow = {
  id: string;
  label: string;
  kind: string;
  scope: string;
  targetId: string;
  buyProductId: string | null;
  buyMinQty: number | null;
  giftProductId: string | null;
  giftQty: number | null;
  threshold: number | null;
  discountType: string | null;
  value: number | null;
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
};

/**
 * Pure promotion-input validator (exported for unit tests). Throws on invalid;
 * returns normalized document fields for the given kind.
 */
export function validatePromotionInput(input: Record<string, unknown>): {
  label: string;
  kind: string;
  scope: string;
  targetId: string;
  buyProductId: string | null;
  buyMinQty: number | null;
  giftProductId: string | null;
  giftQty: number | null;
  threshold: number | null;
  discountType: string | null;
  value: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  isActive: boolean;
} {
  const kind = String(input.kind ?? "");
  if (!(PROMOTION_KINDS as readonly string[]).includes(kind)) {
    throw new Error("Invalid promotion kind.");
  }

  const scope = String(input.scope ?? "");
  if (!(PROMOTION_SCOPES as readonly string[]).includes(scope)) {
    throw new Error("Invalid promotion audience.");
  }
  const targetId = String(input.targetId ?? "").trim();
  if (scope === "customer" && !isValidObjectId(targetId)) {
    throw new Error("Customer-scoped promotions need a valid customer id.");
  }
  if (scope === "businessType" && !(CUSTOMER_MEMORY_BUSINESS_TYPES as readonly string[]).includes(targetId)) {
    throw new Error("businessType-scoped promotions need a valid business type.");
  }

  const startsAt = input.startsAt ? new Date(String(input.startsAt)) : null;
  const endsAt = input.endsAt ? new Date(String(input.endsAt)) : null;
  if (startsAt && Number.isNaN(startsAt.getTime())) throw new Error("Invalid startsAt date.");
  if (endsAt && Number.isNaN(endsAt.getTime())) throw new Error("Invalid endsAt date.");
  if (startsAt && endsAt && endsAt.getTime() <= startsAt.getTime()) {
    throw new Error("endsAt must be after startsAt.");
  }

  const base = {
    label: String(input.label ?? "").trim(),
    kind,
    scope,
    targetId: scope === "global" ? "" : targetId,
    buyProductId: null as string | null,
    buyMinQty: null as number | null,
    giftProductId: null as string | null,
    giftQty: null as number | null,
    threshold: null as number | null,
    discountType: null as string | null,
    value: null as number | null,
    startsAt,
    endsAt,
    isActive: input.isActive !== false,
  };

  const positiveInt = (raw: unknown, message: string): number => {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1) throw new Error(message);
    return n;
  };

  if (kind === "gift") {
    const buyProductId = String(input.buyProductId ?? "");
    const giftProductId = String(input.giftProductId ?? "");
    if (!isValidObjectId(buyProductId)) throw new Error("Gift promotions need a valid trigger product.");
    if (!isValidObjectId(giftProductId)) throw new Error("Gift promotions need a valid gift product.");
    base.buyProductId = buyProductId;
    base.giftProductId = giftProductId;
    base.buyMinQty = positiveInt(input.buyMinQty, "buyMinQty must be an integer of at least 1.");
    base.giftQty = positiveInt(input.giftQty, "giftQty must be an integer of at least 1.");
    return base;
  }

  const threshold = Number(input.threshold);
  if (!Number.isFinite(threshold) || threshold <= 0) {
    throw new Error("Threshold must be greater than 0.");
  }
  base.threshold = threshold;

  if (kind === "minOrderGift") {
    const giftProductId = String(input.giftProductId ?? "");
    if (!isValidObjectId(giftProductId)) throw new Error("Min-order gift promotions need a valid gift product.");
    base.giftProductId = giftProductId;
    base.giftQty = positiveInt(input.giftQty, "giftQty must be an integer of at least 1.");
    return base;
  }

  // orderDiscount
  const discountType = String(input.discountType ?? "");
  const value = Number(input.value);
  if (discountType === "percent") {
    if (!(Number.isFinite(value) && value >= 1 && value <= 90)) {
      throw new Error("Percent order discounts must be between 1 and 90.");
    }
  } else if (discountType === "fixed") {
    if (!(Number.isFinite(value) && value > 0)) {
      throw new Error("Fixed order discounts must be greater than 0.");
    }
  } else {
    throw new Error("Invalid order-discount type.");
  }
  base.discountType = discountType;
  base.value = value;
  return base;
}

type PromotionLeanDoc = {
  _id: mongoose.Types.ObjectId;
  label?: string;
  kind: string;
  scope: string;
  targetId?: string;
  buyProductId?: mongoose.Types.ObjectId | null;
  buyMinQty?: number | null;
  giftProductId?: mongoose.Types.ObjectId | null;
  giftQty?: number | null;
  threshold?: number | null;
  discountType?: string | null;
  value?: number | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
  isActive: boolean;
};

function toRow(d: PromotionLeanDoc): AdminPromotionRow {
  return {
    id: String(d._id),
    label: d.label ?? "",
    kind: d.kind,
    scope: d.scope,
    targetId: d.targetId ?? "",
    buyProductId: d.buyProductId ? String(d.buyProductId) : null,
    buyMinQty: d.buyMinQty ?? null,
    giftProductId: d.giftProductId ? String(d.giftProductId) : null,
    giftQty: d.giftQty ?? null,
    threshold: d.threshold ?? null,
    discountType: d.discountType ?? null,
    value: d.value ?? null,
    startsAt: d.startsAt ? new Date(d.startsAt).toISOString() : null,
    endsAt: d.endsAt ? new Date(d.endsAt).toISOString() : null,
    isActive: d.isActive !== false,
  };
}

export async function listAdminPromotions(): Promise<AdminPromotionRow[]> {
  await requireAdmin();
  await connectDB();
  const docs = (await PromotionModel.find({})
    .sort({ createdAt: -1 })
    .limit(200)
    .lean()
    .exec()) as unknown as PromotionLeanDoc[];
  return docs.map(toRow);
}

export async function createAdminPromotion(input: Record<string, unknown>): Promise<AdminPromotionRow> {
  await requireAdmin();
  const doc = validatePromotionInput(input);
  await connectDB();
  const created = await PromotionModel.create(doc);
  return toRow(created.toObject() as unknown as PromotionLeanDoc);
}

export async function updateAdminPromotion(
  promotionId: string,
  patch: Record<string, unknown>
): Promise<AdminPromotionRow> {
  await requireAdmin();
  if (!isValidObjectId(promotionId)) throw new Error("Promotion not found.");

  await connectDB();
  const existing = (await PromotionModel.findById(promotionId).lean().exec()) as unknown as PromotionLeanDoc | null;
  if (!existing) throw new Error("Promotion not found.");

  // Validate the merged document so partial edits can't produce invalid state.
  const merged = validatePromotionInput({
    label: patch.label !== undefined ? patch.label : existing.label,
    kind: patch.kind !== undefined ? patch.kind : existing.kind,
    scope: patch.scope !== undefined ? patch.scope : existing.scope,
    targetId: patch.targetId !== undefined ? patch.targetId : existing.targetId,
    buyProductId:
      patch.buyProductId !== undefined ? patch.buyProductId : existing.buyProductId ? String(existing.buyProductId) : null,
    buyMinQty: patch.buyMinQty !== undefined ? patch.buyMinQty : existing.buyMinQty,
    giftProductId:
      patch.giftProductId !== undefined ? patch.giftProductId : existing.giftProductId ? String(existing.giftProductId) : null,
    giftQty: patch.giftQty !== undefined ? patch.giftQty : existing.giftQty,
    threshold: patch.threshold !== undefined ? patch.threshold : existing.threshold,
    discountType: patch.discountType !== undefined ? patch.discountType : existing.discountType,
    value: patch.value !== undefined ? patch.value : existing.value,
    startsAt: patch.startsAt !== undefined ? patch.startsAt : existing.startsAt?.toISOString() ?? null,
    endsAt: patch.endsAt !== undefined ? patch.endsAt : existing.endsAt?.toISOString() ?? null,
    isActive: patch.isActive !== undefined ? patch.isActive : existing.isActive,
  });

  await PromotionModel.updateOne({ _id: promotionId }, { $set: merged }).exec();
  const updated = (await PromotionModel.findById(promotionId).lean().exec()) as unknown as PromotionLeanDoc;
  return toRow(updated);
}
