import mongoose, { isValidObjectId } from "mongoose";

import { connectDB } from "@/lib/db";
import { OrderModel } from "@/models/order.model";
import { ProductModel } from "@/models/product.model";
import { addToCart } from "@/services/cart.service";
import { getOrderById } from "@/services/order.service";

const LIST_LIMIT = 12;
const RECENT_SCAN_CAP = 80;

export type SmartOrderingProduct = {
  _id: string;
  name: string;
  sku: string;
  price: number;
  unit: string;
  imageUrl?: string;
  category?: string;
  /** Present for frequent-products responses only. */
  frequency?: number;
};

export type ReorderSkippedItem = {
  productId: string;
  name: string;
  reason: string;
};

export type ReorderSummary = {
  added: number;
  skipped: number;
  skippedItems: ReorderSkippedItem[];
};

type OrderItemRow = {
  productId: mongoose.Types.ObjectId;
  name: string;
  price: number;
  quantity: number;
};

function toUserObjectId(userId: string) {
  if (!isValidObjectId(userId)) {
    throw new Error("Invalid user id.");
  }
  return new mongoose.Types.ObjectId(userId);
}

function mapProductLean(p: {
  _id: mongoose.Types.ObjectId;
  name: string;
  sku: string;
  price: number;
  unit?: string;
  imageUrl?: string;
  category?: string;
}): SmartOrderingProduct {
  return {
    _id: String(p._id),
    name: p.name,
    sku: p.sku,
    price: p.price,
    unit: p.unit ?? "",
    imageUrl: p.imageUrl || undefined,
    category: p.category || undefined,
  };
}

async function loadActiveProductsByIds(
  ids: string[]
): Promise<Map<string, SmartOrderingProduct>> {
  const validIds = ids.filter((id) => isValidObjectId(id)).map((id) => new mongoose.Types.ObjectId(id));
  if (validIds.length === 0) {
    return new Map();
  }
  await connectDB();
  const rows = await ProductModel.find({
    _id: { $in: validIds },
    isActive: true,
  })
    .lean()
    .exec();
  const map = new Map<string, SmartOrderingProduct>();
  for (const row of rows) {
    map.set(
      String(row._id),
      mapProductLean({
        _id: row._id as mongoose.Types.ObjectId,
        name: String(row.name),
        sku: String(row.sku),
        price: Number(row.price),
        unit: row.unit ? String(row.unit) : "",
        imageUrl: row.imageUrl ? String(row.imageUrl) : undefined,
        category: row.category ? String(row.category) : undefined,
      })
    );
  }
  return map;
}

function orderByIdList(ids: string[], productById: Map<string, SmartOrderingProduct>): SmartOrderingProduct[] {
  const out: SmartOrderingProduct[] = [];
  for (const id of ids) {
    const p = productById.get(id);
    if (p) {
      out.push(p);
      if (out.length >= LIST_LIMIT) break;
    }
  }
  return out;
}

/**
 * Unique products from latest orders first (by order date, then item order within each order).
 * Only active products that still exist in the catalog are returned.
 */
export async function getRecentProductsByUser(userId: string): Promise<SmartOrderingProduct[]> {
  const uid = toUserObjectId(userId);
  await connectDB();
  const orders = await OrderModel.find({ userId: uid })
    .sort({ createdAt: -1 })
    .limit(40)
    .lean()
    .exec();

  const seen = new Set<string>();
  const orderedIds: string[] = [];

  for (const doc of orders) {
    const items = (doc.items ?? []) as OrderItemRow[];
    for (const row of items) {
      const pid = String(row.productId);
      if (seen.has(pid)) continue;
      seen.add(pid);
      orderedIds.push(pid);
      if (orderedIds.length >= RECENT_SCAN_CAP) break;
    }
    if (orderedIds.length >= RECENT_SCAN_CAP) break;
  }

  const productById = await loadActiveProductsByIds(orderedIds);
  return orderByIdList(orderedIds, productById);
}

/**
 * Baseline deterministic ranking: total quantity ordered per product (simple frequency).
 * User-marked favorites live in `favorites.service` / UserFavoriteProduct — not inferred here.
 */
export async function getFrequentProductsByUser(userId: string): Promise<SmartOrderingProduct[]> {
  const uid = toUserObjectId(userId);
  await connectDB();
  const orders = await OrderModel.find({ userId: uid }).lean().exec();

  const counts = new Map<string, number>();
  for (const doc of orders) {
    const items = (doc.items ?? []) as OrderItemRow[];
    for (const row of items) {
      const pid = String(row.productId);
      const q = row.quantity;
      if (!Number.isFinite(q) || q < 1) continue;
      counts.set(pid, (counts.get(pid) ?? 0) + q);
    }
  }

  const rankedIds = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);

  const productById = await loadActiveProductsByIds(rankedIds);
  const out: SmartOrderingProduct[] = [];
  for (const id of rankedIds) {
    const p = productById.get(id);
    if (!p) continue;
    const frequency = counts.get(id) ?? 0;
    out.push({ ...p, frequency });
    if (out.length >= LIST_LIMIT) break;
  }
  return out;
}

/**
 * Re-adds each order line to the cart using current product prices via `addToCart`.
 * Missing or inactive products are skipped with reasons in the summary.
 */
export async function reorderOrderToCart(userId: string, orderId: string): Promise<ReorderSummary> {
  const order = await getOrderById(userId, orderId);
  let added = 0;
  let skipped = 0;
  const skippedItems: ReorderSkippedItem[] = [];

  for (const item of order.items) {
    const productId = item.productId;
    const name = item.name?.trim() || "Unknown";

    if (!isValidObjectId(productId)) {
      skipped += 1;
      skippedItems.push({ productId, name, reason: "invalid_product_id" });
      continue;
    }

    const qty = Math.floor(item.quantity);
    if (qty < 1) {
      skipped += 1;
      skippedItems.push({ productId, name, reason: "invalid_quantity" });
      continue;
    }

    try {
      await addToCart(userId, productId, qty);
      added += 1;
    } catch (e) {
      skipped += 1;
      const msg = e instanceof Error ? e.message : "add_failed";
      skippedItems.push({ productId, name, reason: msg });
    }
  }

  return { added, skipped, skippedItems };
}
