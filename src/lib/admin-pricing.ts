import mongoose, { isValidObjectId } from "mongoose";
import { revalidateTag } from "next/cache";

import { requireAdmin } from "@/lib/auth-user";
import { connectDB } from "@/lib/db";
import { CUSTOMER_MEMORY_BUSINESS_TYPES } from "@/models/customer-memory.model";
import { CustomerMemoryModel } from "@/models/customer-memory.model";
import { DISCOUNT_SCOPES, DISCOUNT_TYPES, DiscountModel } from "@/models/discount.model";
import { PriceOverrideModel } from "@/models/price-override.model";
import { ProductModel } from "@/models/product.model";
import { UserModel } from "@/models/user.model";
import { PRODUCTS_CACHE_TAG } from "@/services/product.service";

/** Admin-facing pricing tools (tier prices, per-customer overrides, discounts). */

export type AdminDiscountRow = {
  id: string;
  label: string;
  scope: string;
  targetId: string;
  type: string;
  value: number;
  productIds: string[];
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
};

export type ProductPricingInfo = {
  productId: string;
  name: string;
  basePrice: number;
  tierPrices: Record<string, number>;
  overrides: Array<{
    userId: string;
    businessName: string;
    phoneNumber: string;
    price: number;
  }>;
};

function assertValidProductId(productId: string) {
  if (!isValidObjectId(productId)) {
    throw new Error("Product not found.");
  }
}

/**
 * Pure discount-input validator (exported for unit tests). Throws on invalid;
 * returns the normalized document fields.
 */
export function validateDiscountInput(input: Record<string, unknown>): {
  label: string;
  scope: string;
  targetId: string;
  type: string;
  value: number;
  productIds: string[];
  startsAt: Date | null;
  endsAt: Date | null;
  isActive: boolean;
} {
  const scope = String(input.scope ?? "");
  if (!(DISCOUNT_SCOPES as readonly string[]).includes(scope)) {
    throw new Error("Invalid discount scope.");
  }
  const targetId = String(input.targetId ?? "").trim();
  if (scope === "customer" && !isValidObjectId(targetId)) {
    throw new Error("Customer-scoped discounts need a valid customer id.");
  }
  if (scope === "businessType" && !(CUSTOMER_MEMORY_BUSINESS_TYPES as readonly string[]).includes(targetId)) {
    throw new Error("businessType-scoped discounts need a valid business type.");
  }

  const type = String(input.type ?? "");
  if (!(DISCOUNT_TYPES as readonly string[]).includes(type)) {
    throw new Error("Invalid discount type.");
  }
  const value = Number(input.value);
  if (type === "percent" && !(Number.isFinite(value) && value >= 1 && value <= 90)) {
    throw new Error("Percent discounts must be between 1 and 90.");
  }
  if (type === "fixed" && !(Number.isFinite(value) && value > 0)) {
    throw new Error("Fixed discounts must be greater than 0.");
  }

  const productIdsRaw = Array.isArray(input.productIds) ? input.productIds : [];
  const productIds = productIdsRaw.map(String);
  if (productIds.some((id) => !isValidObjectId(id))) {
    throw new Error("Invalid product id in productIds.");
  }

  const startsAt = input.startsAt ? new Date(String(input.startsAt)) : null;
  const endsAt = input.endsAt ? new Date(String(input.endsAt)) : null;
  if (startsAt && Number.isNaN(startsAt.getTime())) throw new Error("Invalid startsAt date.");
  if (endsAt && Number.isNaN(endsAt.getTime())) throw new Error("Invalid endsAt date.");
  if (startsAt && endsAt && endsAt.getTime() <= startsAt.getTime()) {
    throw new Error("endsAt must be after startsAt.");
  }

  return {
    label: String(input.label ?? "").trim(),
    scope,
    targetId: scope === "global" ? "" : targetId,
    type,
    value,
    productIds,
    startsAt,
    endsAt,
    isActive: input.isActive !== false,
  };
}

type DiscountLeanDoc = {
  _id: mongoose.Types.ObjectId;
  label?: string;
  scope: string;
  targetId?: string;
  type: string;
  value: number;
  productIds?: mongoose.Types.ObjectId[];
  startsAt?: Date | null;
  endsAt?: Date | null;
  isActive: boolean;
};

function discountToRow(d: DiscountLeanDoc): AdminDiscountRow {
  return {
    id: String(d._id),
    label: d.label ?? "",
    scope: d.scope,
    targetId: d.targetId ?? "",
    type: d.type,
    value: d.value,
    productIds: (d.productIds ?? []).map(String),
    startsAt: d.startsAt ? new Date(d.startsAt).toISOString() : null,
    endsAt: d.endsAt ? new Date(d.endsAt).toISOString() : null,
    isActive: d.isActive !== false,
  };
}

export async function getProductPricing(productId: string): Promise<ProductPricingInfo> {
  await requireAdmin();
  assertValidProductId(productId);
  await connectDB();

  const product = (await ProductModel.findById(productId)
    .select("name price tierPrices")
    .lean()
    .exec()) as {
    _id: mongoose.Types.ObjectId;
    name: string;
    price: number;
    tierPrices?: Map<string, number> | Record<string, number> | null;
  } | null;
  if (!product) throw new Error("Product not found.");

  const overrides = await PriceOverrideModel.find({ productId }).lean().exec();
  const userIds = overrides.map((o) => o.userId);
  const users = await UserModel.find(
    { _id: { $in: userIds } },
    { businessName: 1, phoneNumber: 1 }
  )
    .lean()
    .exec();
  const userById = new Map(users.map((u) => [String(u._id), u]));

  const tierPrices: Record<string, number> = {};
  const rawTiers =
    product.tierPrices instanceof Map
      ? Object.fromEntries(product.tierPrices)
      : (product.tierPrices ?? {});
  for (const key of CUSTOMER_MEMORY_BUSINESS_TYPES) {
    const value = (rawTiers as Record<string, number>)[key];
    if (typeof value === "number" && value > 0) tierPrices[key] = value;
  }

  return {
    productId: String(product._id),
    name: product.name,
    basePrice: product.price,
    tierPrices,
    overrides: overrides.map((o) => {
      const user = userById.get(String(o.userId));
      return {
        userId: String(o.userId),
        businessName: user?.businessName ?? "?",
        phoneNumber: user?.phoneNumber ?? "",
        price: o.price,
      };
    }),
  };
}

/** Replaces the tier-price map. Values must be > 0; missing/null keys are removed. */
export async function setProductTierPrices(
  productId: string,
  tierPrices: Record<string, unknown>
): Promise<ProductPricingInfo> {
  await requireAdmin();
  assertValidProductId(productId);

  const clean: Record<string, number> = {};
  for (const [key, raw] of Object.entries(tierPrices ?? {})) {
    if (!(CUSTOMER_MEMORY_BUSINESS_TYPES as readonly string[]).includes(key)) {
      throw new Error(`Unknown business type "${key}".`);
    }
    if (raw === null || raw === undefined || raw === "") continue;
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error("Tier prices must be greater than 0.");
    }
    clean[key] = Math.round(value * 100) / 100;
  }

  await connectDB();
  const res = await ProductModel.updateOne(
    { _id: productId },
    Object.keys(clean).length > 0 ? { $set: { tierPrices: clean } } : { $unset: { tierPrices: 1 } }
  ).exec();
  if (res.matchedCount === 0) throw new Error("Product not found.");

  // tierPrices ride inside the cached catalog items — bust the catalog cache.
  revalidateTag(PRODUCTS_CACHE_TAG, { expire: 0 });
  return getProductPricing(productId);
}

export async function setCustomerPriceOverride(
  productId: string,
  userId: string,
  price: number
): Promise<ProductPricingInfo> {
  await requireAdmin();
  assertValidProductId(productId);
  if (!isValidObjectId(userId)) throw new Error("Customer not found.");
  if (!Number.isFinite(price) || price <= 0) throw new Error("Override price must be greater than 0.");

  await connectDB();
  const [product, user] = await Promise.all([
    ProductModel.findById(productId).select("_id").lean().exec(),
    UserModel.findById(userId).select("_id role").lean().exec(),
  ]);
  if (!product) throw new Error("Product not found.");
  if (!user || user.role === "admin") throw new Error("Customer not found.");

  await PriceOverrideModel.updateOne(
    { userId, productId },
    { $set: { price: Math.round(price * 100) / 100 } },
    { upsert: true }
  ).exec();

  return getProductPricing(productId);
}

export async function removeCustomerPriceOverride(
  productId: string,
  userId: string
): Promise<ProductPricingInfo> {
  await requireAdmin();
  assertValidProductId(productId);
  if (!isValidObjectId(userId)) throw new Error("Customer not found.");

  await connectDB();
  await PriceOverrideModel.deleteOne({ userId, productId }).exec();
  return getProductPricing(productId);
}

export async function listAdminDiscounts(): Promise<AdminDiscountRow[]> {
  await requireAdmin();
  await connectDB();
  const docs = (await DiscountModel.find({})
    .sort({ createdAt: -1 })
    .limit(200)
    .lean()
    .exec()) as unknown as DiscountLeanDoc[];
  return docs.map(discountToRow);
}

export async function createAdminDiscount(input: Record<string, unknown>): Promise<AdminDiscountRow> {
  await requireAdmin();
  const doc = validateDiscountInput(input);
  await connectDB();
  const created = await DiscountModel.create(doc);
  return discountToRow(created.toObject() as unknown as DiscountLeanDoc);
}

export async function updateAdminDiscount(
  discountId: string,
  patch: Record<string, unknown>
): Promise<AdminDiscountRow> {
  await requireAdmin();
  if (!isValidObjectId(discountId)) throw new Error("Discount not found.");

  await connectDB();
  const existing = (await DiscountModel.findById(discountId).lean().exec()) as unknown as DiscountLeanDoc | null;
  if (!existing) throw new Error("Discount not found.");

  // Validate the merged document so partial edits can't produce invalid state.
  const merged = validateDiscountInput({
    label: patch.label !== undefined ? patch.label : existing.label,
    scope: patch.scope !== undefined ? patch.scope : existing.scope,
    targetId: patch.targetId !== undefined ? patch.targetId : existing.targetId,
    type: patch.type !== undefined ? patch.type : existing.type,
    value: patch.value !== undefined ? patch.value : existing.value,
    productIds:
      patch.productIds !== undefined ? patch.productIds : (existing.productIds ?? []).map(String),
    startsAt:
      patch.startsAt !== undefined ? patch.startsAt : existing.startsAt?.toISOString() ?? null,
    endsAt: patch.endsAt !== undefined ? patch.endsAt : existing.endsAt?.toISOString() ?? null,
    isActive: patch.isActive !== undefined ? patch.isActive : existing.isActive,
  });

  await DiscountModel.updateOne({ _id: discountId }, { $set: merged }).exec();
  const updated = (await DiscountModel.findById(discountId).lean().exec()) as unknown as DiscountLeanDoc;
  return discountToRow(updated);
}

export type CustomerPricingSummary = {
  userId: string;
  businessType: string | null;
  overrides: Array<{ productId: string; productName: string; sku: string; basePrice: number; price: number }>;
  discounts: AdminDiscountRow[];
};

/** Per-customer pricing view for the admin customers page. */
export async function getCustomerPricingSummary(userId: string): Promise<CustomerPricingSummary> {
  await requireAdmin();
  if (!isValidObjectId(userId)) throw new Error("Customer not found.");
  await connectDB();

  const memory = await CustomerMemoryModel.findOne({ userId }).select("businessType").lean().exec();
  const businessType = memory?.businessType ?? null;

  const overrides = await PriceOverrideModel.find({ userId }).lean().exec();
  const products = await ProductModel.find(
    { _id: { $in: overrides.map((o) => o.productId) } },
    { name: 1, sku: 1, price: 1 }
  )
    .lean()
    .exec();
  const productById = new Map(products.map((p) => [String(p._id), p]));

  const scopeOr: Array<Record<string, unknown>> = [
    { scope: "global" },
    { scope: "customer", targetId: userId },
  ];
  if (businessType) scopeOr.push({ scope: "businessType", targetId: businessType });
  const discounts = (await DiscountModel.find({ isActive: true, $or: scopeOr })
    .sort({ createdAt: -1 })
    .lean()
    .exec()) as unknown as DiscountLeanDoc[];

  return {
    userId,
    businessType,
    overrides: overrides.map((o) => {
      const p = productById.get(String(o.productId));
      return {
        productId: String(o.productId),
        productName: p?.name ?? "?",
        sku: p?.sku ?? "",
        basePrice: p?.price ?? 0,
        price: o.price,
      };
    }),
    discounts: discounts.map(discountToRow),
  };
}
