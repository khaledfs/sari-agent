import mongoose, { isValidObjectId } from "mongoose";

import { connectDB } from "@/lib/db";
import { CustomerAccountModel } from "@/models/customer-account.model";
import { OrderModel } from "@/models/order.model";
import { ProductModel } from "@/models/product.model";
import { isFavoriteProduct } from "@/services/favorites.service";
import { BUSINESS_TYPES, SIZE_BANDS, type BusinessType, type SizeBand } from "@/types/business-segmentation";
import type { RecommendationUserProductFeatures } from "@/types/recommendation";

type OrderItemRow = {
  productId: mongoose.Types.ObjectId;
  quantity: number;
};

function toUserObjectId(userId: string) {
  if (!isValidObjectId(userId)) {
    throw new Error("Invalid user id.");
  }
  return new mongoose.Types.ObjectId(userId);
}

function parseBusinessType(v: unknown): BusinessType | null {
  if (typeof v !== "string" || !v.trim()) return null;
  return (BUSINESS_TYPES as readonly string[]).includes(v) ? (v as BusinessType) : null;
}

function parseSizeBand(v: unknown): SizeBand | null {
  if (typeof v !== "string" || !v.trim()) return null;
  return (SIZE_BANDS as readonly string[]).includes(v) ? (v as SizeBand) : null;
}

/**
 * Builds a structured (user, product) feature vector for future ranking / ML training.
 *
 * - Frequent-style signals come from order history only (deterministic).
 * - `favorite.isExplicitFavorite` reflects user-marked favorites only (not inferred).
 * - Future model-based recommendations stay a separate layer on top of these features.
 */
export async function buildRecommendationUserProductFeatures(
  userId: string,
  productId: string,
  referenceAt: Date = new Date()
): Promise<RecommendationUserProductFeatures | null> {
  if (!isValidObjectId(userId) || !isValidObjectId(productId)) {
    return null;
  }

  const uid = toUserObjectId(userId);
  const pid = new mongoose.Types.ObjectId(productId);
  await connectDB();

  const product = await ProductModel.findById(pid).lean();
  if (!product) {
    return null;
  }

  const category = product.category ? String(product.category) : "";

  const orders = await OrderModel.find({ userId: uid }).sort({ createdAt: -1 }).lean().exec();

  const allIds = new Set<string>();
  for (const doc of orders) {
    for (const row of (doc.items ?? []) as OrderItemRow[]) {
      allIds.add(String(row.productId));
    }
  }
  const idList = [...allIds].filter((id) => isValidObjectId(id)).map((id) => new mongoose.Types.ObjectId(id));
  const categoryByProductId = new Map<string, string>();
  if (idList.length > 0) {
    const prows = await ProductModel.find({ _id: { $in: idList } }).select("category").lean().exec();
    for (const p of prows) {
      categoryByProductId.set(String(p._id), p.category ? String(p.category) : "");
    }
  }

  const refMs = referenceAt.getTime();
  const ms30 = 30 * 86_400_000;
  const ms90 = 90 * 86_400_000;

  const ordersWithProduct: Array<{ id: string; at: number; qty: number }> = [];
  let totalQty = 0;
  let totalLinesAllCategories = 0;
  const categoryLineCount = new Map<string, number>();

  for (const doc of orders) {
    const oid = String(doc._id);
    const at = doc.createdAt ? new Date(doc.createdAt as Date).getTime() : 0;
    const items = (doc.items ?? []) as OrderItemRow[];
    let orderHasTarget = false;
    let qtyThisOrder = 0;

    for (const row of items) {
      totalLinesAllCategories += 1;
      const linePid = String(row.productId);
      const lineCat = categoryByProductId.get(linePid) ?? "";
      if (lineCat) {
        categoryLineCount.set(lineCat, (categoryLineCount.get(lineCat) ?? 0) + 1);
      }
      if (linePid === productId) {
        orderHasTarget = true;
        const q = row.quantity;
        if (Number.isFinite(q) && q >= 1) {
          qtyThisOrder += q;
        }
      }
    }

    if (orderHasTarget) {
      totalQty += qtyThisOrder;
      ordersWithProduct.push({ id: oid, at, qty: qtyThisOrder });
    }
  }

  const distinctOrders = ordersWithProduct.length;
  const timesLast30 = ordersWithProduct.filter((o) => refMs - o.at <= ms30).length;
  const timesLast90 = ordersWithProduct.filter((o) => refMs - o.at <= ms90).length;
  const lastHitAt = ordersWithProduct.reduce((max, o) => Math.max(max, o.at), 0);
  const daysSinceLast =
    lastHitAt > 0 ? Math.max(0, Math.floor((refMs - lastHitAt) / 86_400_000)) : null;

  const lastOrder = orders[0];
  const lastOrderIds = new Set(
    ((lastOrder?.items ?? []) as OrderItemRow[]).map((r) => String(r.productId))
  );
  const last3Ids = new Set<string>();
  for (const doc of orders.slice(0, 3)) {
    for (const row of (doc.items ?? []) as OrderItemRow[]) {
      last3Ids.add(String(row.productId));
    }
  }

  const catCount = category ? (categoryLineCount.get(category) ?? 0) : 0;
  const share = totalLinesAllCategories > 0 ? catCount / totalLinesAllCategories : 0;
  const counts = [...categoryLineCount.values()];
  const topCount = counts.length === 0 ? 0 : Math.max(...counts);
  const isTopCategory = category ? catCount > 0 && catCount === topCount : false;

  const account = await CustomerAccountModel.findOne({ userId: uid }).lean().exec();
  const specRaw = account?.specialization;
  const specialization =
    typeof specRaw === "string" && specRaw.trim() ? specRaw.trim() : null;

  const isFav = await isFavoriteProduct(userId, productId);

  return {
    userId,
    productId,
    referenceAt: referenceAt.toISOString(),
    userProductHistory: {
      timesPurchasedTotal: distinctOrders,
      timesPurchasedLast30d: timesLast30,
      timesPurchasedLast90d: timesLast90,
      daysSinceLastPurchase: daysSinceLast,
      wasInLastOrder: lastOrderIds.has(productId),
      wasInLast3Orders: last3Ids.has(productId),
      averageQuantity: distinctOrders > 0 ? Math.round((totalQty / distinctOrders) * 100) / 100 : 0,
      totalQuantityOrdered: totalQty,
    },
    categoryAffinity: {
      categoryPurchaseCount: catCount,
      categoryShare: Math.round(share * 1000) / 1000,
      isTopCategoryForCustomer: isTopCategory,
    },
    favorite: {
      isExplicitFavorite: isFav,
    },
    businessProfile: {
      businessType: parseBusinessType(account?.businessType),
      specialization,
      sizeBand: parseSizeBand(account?.sizeBand),
    },
    product: {
      category,
      price: Number(product.price),
      unit: product.unit ? String(product.unit) : "",
      packageSize: product.packageSize ? String(product.packageSize) : "",
      isActive: Boolean(product.isActive),
    },
  };
}
