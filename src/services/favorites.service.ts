import mongoose, { isValidObjectId } from "mongoose";

import { connectDB } from "@/lib/db";
import { ProductModel } from "@/models/product.model";
import { UserFavoriteProductModel } from "@/models/user-favorite-product.model";

/**
 * Catalog shape returned for favorite rows (active products only).
 * Explicit favorites only — not inferred from orders.
 */
export type FavoriteProduct = {
  _id: string;
  name: string;
  sku: string;
  price: number;
  unit: string;
  imageUrl?: string;
  category?: string;
};

const LIST_LIMIT = 12;

function toUserObjectId(userId: string) {
  if (!isValidObjectId(userId)) {
    throw new Error("Invalid user id.");
  }
  return new mongoose.Types.ObjectId(userId);
}

function mapProduct(p: {
  _id: mongoose.Types.ObjectId;
  name: string;
  sku: string;
  price: number;
  unit?: string;
  imageUrl?: string;
  category?: string;
}): FavoriteProduct {
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

/**
 * User-marked favorites only, resolved to active catalog products (newest favorite first).
 */
export async function getFavoriteProductsByUser(userId: string): Promise<FavoriteProduct[]> {
  const uid = toUserObjectId(userId);
  await connectDB();
  const rows = await UserFavoriteProductModel.find({ userId: uid })
    .sort({ createdAt: -1 })
    .limit(80)
    .lean()
    .exec();

  const ids = rows.map((r) => String(r.productId)).filter((id) => isValidObjectId(id));
  if (ids.length === 0) return [];

  const oids = ids.map((id) => new mongoose.Types.ObjectId(id));
  const products = await ProductModel.find({ _id: { $in: oids }, isActive: true }).lean().exec();
  const byId = new Map<string, FavoriteProduct>();
  for (const row of products) {
    byId.set(
      String(row._id),
      mapProduct({
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

  const out: FavoriteProduct[] = [];
  for (const id of ids) {
    const p = byId.get(id);
    if (p) {
      out.push(p);
      if (out.length >= LIST_LIMIT) break;
    }
  }
  return out;
}

export async function isFavoriteProduct(userId: string, productId: string): Promise<boolean> {
  if (!isValidObjectId(userId) || !isValidObjectId(productId)) {
    return false;
  }
  await connectDB();
  const uid = toUserObjectId(userId);
  const pid = new mongoose.Types.ObjectId(productId);
  const doc = await UserFavoriteProductModel.findOne({ userId: uid, productId: pid }).lean().exec();
  return Boolean(doc);
}

export async function addFavoriteProduct(userId: string, productId: string): Promise<void> {
  if (!isValidObjectId(productId)) {
    throw new Error("Invalid product id.");
  }
  const uid = toUserObjectId(userId);
  const pid = new mongoose.Types.ObjectId(productId);
  await connectDB();

  const product = await ProductModel.findById(pid).lean();
  if (!product || !product.isActive) {
    throw new Error("Product is not available.");
  }

  try {
    await UserFavoriteProductModel.create({ userId: uid, productId: pid });
  } catch (e) {
    const code = e && typeof e === "object" && "code" in e ? (e as { code?: number }).code : undefined;
    if (code === 11000) {
      return;
    }
    throw e instanceof Error ? e : new Error("Failed to add favorite.");
  }
}

export async function removeFavoriteProduct(userId: string, productId: string): Promise<void> {
  if (!isValidObjectId(productId)) {
    throw new Error("Invalid product id.");
  }
  const uid = toUserObjectId(userId);
  const pid = new mongoose.Types.ObjectId(productId);
  await connectDB();
  await UserFavoriteProductModel.deleteOne({ userId: uid, productId: pid }).exec();
}
