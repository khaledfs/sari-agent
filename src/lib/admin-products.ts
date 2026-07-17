import mongoose, { isValidObjectId } from "mongoose";
import { revalidateTag } from "next/cache";

import { requireAdmin, requireConsoleUser } from "@/lib/auth-user";
import { connectDB } from "@/lib/db";
import { ADJUSTABLE_STATUSES, stockShortage } from "@/lib/order-adjustment";
import { publishRealtimeEvent } from "@/services/event-bus.service";
import { OrderModel } from "@/models/order.model";
import { ProductModel } from "@/models/product.model";
import { PRODUCTS_CACHE_TAG } from "@/services/product.service";

/**
 * Admin product management, mirroring the patterns of admin-orders.ts:
 * requireAdmin per request, plain Error messages mapped to status codes in
 * thin routes, row shapes serialized for the client.
 */

export type AdminProductRow = {
  id: string;
  name: string;
  sku: string;
  category: string;
  price: number;
  unit: string;
  packageSize: string;
  imageUrl: string;
  isActive: boolean;
  stock: number | null;
  lowStockThreshold: number;
};

export type AdminProductListParams = {
  search?: string;
  category?: string;
  /** "all" | "active" | "inactive" */
  active?: string;
  page?: number;
  pageSize?: number;
};

export type AdminProductListResult = {
  items: AdminProductRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

/** Fields an admin may change through updateAdminProduct — nothing else. */
const UPDATABLE_FIELDS = [
  "name",
  "price",
  "unit",
  "packageSize",
  "isActive",
  "stock",
  "lowStockThreshold",
  "category",
] as const;

type UpdatableField = (typeof UPDATABLE_FIELDS)[number];

export type AdminProductPatch = Partial<{
  name: string;
  price: number;
  unit: string;
  packageSize: string;
  isActive: boolean;
  stock: number | null;
  lowStockThreshold: number;
  category: string;
}>;

type ProductLean = {
  _id: mongoose.Types.ObjectId;
  name: string;
  sku: string;
  category?: string;
  price: number;
  unit?: string;
  packageSize?: string;
  imageUrl?: string;
  isActive: boolean;
  stock?: number | null;
  lowStockThreshold?: number;
};

export type StockShortageRow = {
  productId: string;
  name: string;
  sku: string;
  stock: number;
  /** Total supplied quantity committed across open pre-dispatch orders. */
  committed: number;
  /** committed − stock (> 0 by construction). */
  shortage: number;
  /** Open orders holding this product, for the "spread the shortage" links. */
  openOrderIds: string[];
};

/**
 * Warehouse shortage alert (read-only): for every product with tracked stock,
 * the total quantity COMMITTED across all open pre-dispatch orders (using the
 * supplied quantity, which defaults to ordered) vs current stock — surfaced
 * only where committed > stock. ONE aggregation over open orders (no N+1),
 * admin-only. This is what lets the manager spread a shortage in the morning
 * instead of at the truck.
 */
export async function getStockShortages(): Promise<StockShortageRow[]> {
  await requireAdmin();
  await connectDB();

  const committedByProduct = await OrderModel.aggregate<{
    _id: mongoose.Types.ObjectId;
    committed: number;
    orderIds: mongoose.Types.ObjectId[];
  }>([
    { $match: { status: { $in: [...ADJUSTABLE_STATUSES] } } },
    { $unwind: "$items" },
    {
      $group: {
        _id: "$items.productId",
        committed: { $sum: { $ifNull: ["$items.suppliedQuantity", "$items.quantity"] } },
        orderIds: { $addToSet: "$_id" },
      },
    },
    { $match: { committed: { $gt: 0 } } },
  ]).exec();

  if (committedByProduct.length === 0) return [];

  const productIds = committedByProduct.map((c) => c._id).filter(Boolean);
  const products = (await ProductModel.find(
    { _id: { $in: productIds }, stock: { $ne: null } },
    { name: 1, sku: 1, stock: 1 }
  )
    .lean()
    .exec()) as unknown as Array<{ _id: mongoose.Types.ObjectId; name: string; sku: string; stock: number | null }>;

  const stockById = new Map(products.map((p) => [String(p._id), p]));
  const rows: StockShortageRow[] = [];
  for (const c of committedByProduct) {
    const product = stockById.get(String(c._id));
    if (!product || typeof product.stock !== "number") continue; // untracked stock → not a shortage
    const shortage = stockShortage(c.committed, product.stock);
    if (shortage > 0) {
      rows.push({
        productId: String(c._id),
        name: product.name,
        sku: product.sku,
        stock: product.stock,
        committed: c.committed,
        shortage,
        openOrderIds: c.orderIds.map((id) => String(id)),
      });
    }
  }
  // Worst shortage first.
  rows.sort((a, b) => b.shortage - a.shortage);
  return rows;
}

function toRow(p: ProductLean): AdminProductRow {
  return {
    id: String(p._id),
    name: p.name,
    sku: p.sku,
    category: p.category ?? "",
    price: p.price,
    unit: p.unit ?? "",
    packageSize: p.packageSize ?? "",
    imageUrl: p.imageUrl ?? "",
    isActive: p.isActive !== false,
    stock: typeof p.stock === "number" ? p.stock : null,
    lowStockThreshold: typeof p.lowStockThreshold === "number" ? p.lowStockThreshold : 10,
  };
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Pure filter builder (exported for unit tests). Hebrew-safe: search matches
 * name OR sku via an escaped, case-insensitive regex — no text index needed.
 */
export function buildAdminProductFilter(params: {
  search?: string;
  category?: string;
  active?: string;
}): Record<string, unknown> {
  const filter: Record<string, unknown> = {};

  const search = params.search?.trim();
  if (search) {
    const rx = new RegExp(escapeRegex(search), "i");
    filter.$or = [{ name: rx }, { sku: rx }];
  }

  const category = params.category?.trim();
  if (category) {
    filter.category = category;
  }

  if (params.active === "active") filter.isActive = true;
  else if (params.active === "inactive") filter.isActive = false;

  return filter;
}

/**
 * Pure patch validator (exported for unit tests). Whitelist-only: any key
 * outside UPDATABLE_FIELDS is rejected, price must be > 0, stock must be
 * null (untracked) or an integer >= 0, threshold an integer >= 0.
 */
export function sanitizeAdminProductPatch(patch: Record<string, unknown>): AdminProductPatch {
  const keys = Object.keys(patch ?? {});
  if (keys.length === 0) {
    throw new Error("At least one field is required for update.");
  }

  const clean: Record<string, unknown> = {};
  for (const key of keys) {
    if (!(UPDATABLE_FIELDS as readonly string[]).includes(key)) {
      throw new Error(`Field "${key}" cannot be updated.`);
    }
    const value = patch[key];
    switch (key as UpdatableField) {
      case "name": {
        const name = typeof value === "string" ? value.trim() : "";
        if (!name) throw new Error("Product name is required.");
        clean.name = name;
        break;
      }
      case "price": {
        if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
          throw new Error("Price must be greater than 0.");
        }
        clean.price = value;
        break;
      }
      case "stock": {
        if (value === null) {
          clean.stock = null;
          break;
        }
        if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
          throw new Error("Stock must be null (untracked) or an integer of at least 0.");
        }
        clean.stock = value;
        break;
      }
      case "lowStockThreshold": {
        if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
          throw new Error("Low-stock threshold must be an integer of at least 0.");
        }
        clean.lowStockThreshold = value;
        break;
      }
      case "isActive": {
        if (typeof value !== "boolean") throw new Error("isActive must be a boolean.");
        clean.isActive = value;
        break;
      }
      case "unit":
      case "packageSize":
      case "category": {
        if (typeof value !== "string") throw new Error(`${key} must be a string.`);
        clean[key] = value.trim();
        break;
      }
    }
  }
  return clean as AdminProductPatch;
}

/**
 * Pure SKU generator for manually created products (exported for unit tests):
 * "MANUAL-" + name slug (unicode letters/digits kept, spaces → "-", uppercased).
 */
export function buildManualSku(name: string): string {
  const slug = (name ?? "")
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase();
  return slug ? `MANUAL-${slug}` : `MANUAL-${Date.now().toString(36).toUpperCase()}`;
}

export async function listAdminProducts(
  params: AdminProductListParams = {}
): Promise<AdminProductListResult> {
  // Task D decision: catalog READS stay available to agents (they need the
  // product reference for pricing/promotions on their own customers); every
  // catalog WRITE below is admin-only (requireAdmin → 403 for agents).
  await requireConsoleUser();
  await connectDB();

  const page = Math.max(1, Math.floor(params.page ?? 1));
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(params.pageSize ?? DEFAULT_PAGE_SIZE)));
  const filter = buildAdminProductFilter(params);

  const [total, items] = await Promise.all([
    ProductModel.countDocuments(filter).exec(),
    ProductModel.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean()
      .exec() as unknown as Promise<ProductLean[]>,
  ]);

  return {
    items: items.map(toRow),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function updateAdminProduct(
  productId: string,
  patch: Record<string, unknown>
): Promise<AdminProductRow> {
  await requireAdmin();
  if (!isValidObjectId(productId)) {
    throw new Error("Product not found.");
  }
  const clean = sanitizeAdminProductPatch(patch);

  await connectDB();
  const updated = (await ProductModel.findByIdAndUpdate(
    productId,
    { $set: clean },
    { returnDocument: "after", runValidators: true }
  )
    .lean()
    .exec()) as unknown as ProductLean | null;

  if (!updated) {
    throw new Error("Product not found.");
  }
  // Customer catalog is cached under this tag — bust it on every admin edit.
  revalidateTag(PRODUCTS_CACHE_TAG, { expire: 0 });

  // Realtime (catalog channel, ids only — clients refetch their own prices).
  const changedId = String(updated._id);
  if ("stock" in clean) {
    publishRealtimeEvent({
      type: "inventory.updated",
      productId: changedId,
      stock: typeof updated.stock === "number" ? updated.stock : null,
    });
  }
  publishRealtimeEvent({ type: "product.updated", productId: changedId });
  return toRow(updated);
}

export async function createAdminProduct(data: Record<string, unknown>): Promise<AdminProductRow> {
  await requireAdmin();

  const name = typeof data.name === "string" ? data.name.trim() : "";
  const category = typeof data.category === "string" ? data.category.trim() : "";
  const price = data.price;
  if (!name) throw new Error("Product name is required.");
  if (!category) throw new Error("Category is required.");
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
    throw new Error("Price must be greater than 0.");
  }

  let stock: number | null = null;
  if (data.stock !== undefined && data.stock !== null) {
    if (typeof data.stock !== "number" || !Number.isInteger(data.stock) || data.stock < 0) {
      throw new Error("Stock must be null (untracked) or an integer of at least 0.");
    }
    stock = data.stock;
  }

  const skuInput = typeof data.sku === "string" ? data.sku.trim().toUpperCase() : "";
  const sku = skuInput || buildManualSku(name);

  await connectDB();
  try {
    const created = await ProductModel.create({
      name,
      sku,
      category,
      price,
      unit: typeof data.unit === "string" ? data.unit.trim() : "",
      packageSize: typeof data.packageSize === "string" ? data.packageSize.trim() : "",
      imageUrl: typeof data.imageUrl === "string" ? data.imageUrl.trim() : "",
      isActive: data.isActive !== false,
      stock,
    });
    revalidateTag(PRODUCTS_CACHE_TAG, { expire: 0 });
    publishRealtimeEvent({ type: "product.updated", productId: String(created._id) });
    return toRow(created.toObject() as unknown as ProductLean);
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: number }).code === 11000) {
      throw new Error("SKU already exists.");
    }
    throw error;
  }
}
