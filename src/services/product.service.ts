import { isValidObjectId } from "mongoose";
import { unstable_cache } from "next/cache";
import { z } from "zod";

import { connectDB } from "@/lib/db";
import { ProductModel } from "@/models/product.model";

/** Cache tag for the customer catalog — invalidated on admin product edits. */
export const PRODUCTS_CACHE_TAG = "products";
/** TTL fallback (seconds) so out-of-band writes (sync script) stay bounded-stale. */
const CATALOG_CACHE_TTL_SECONDS = 300;

/** JSON-safe catalog item (unstable_cache serializes — no ObjectId/Date/Map). */
export type CatalogProduct = {
  _id: string;
  name: string;
  sku: string;
  category: string;
  price: number;
  unit: string;
  packageSize: string;
  imageUrl: string;
  isActive: boolean;
  stock: number | null;
  tierPrices?: Record<string, number>;
  createdAt: string;
};

export type CatalogPage = {
  items: CatalogProduct[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export const CATALOG_MAX_PAGE_SIZE = 50;

export const CATALOG_SORT_OPTIONS = ["default", "price_asc", "price_desc"] as const;
export type CatalogSortOption = (typeof CATALOG_SORT_OPTIONS)[number];

/**
 * Mongo sort spec for a catalog-browse sort option (pure, unit-tested). Price
 * sort is by BASE price (`product.price`) — the browse page comes from the
 * base-priced tagged cache, so per-customer overrides can't reorder it here
 * without breaking the cache; the search path sorts by the customer price.
 */
export function resolveCatalogSort(sort: string | undefined): Record<string, 1 | -1> {
  switch (sort) {
    case "price_asc":
      return { price: 1, _id: 1 };
    case "price_desc":
      return { price: -1, _id: 1 };
    default:
      return { createdAt: -1, _id: -1 };
  }
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type ProductLeanForCatalog = {
  _id: unknown;
  name: string;
  sku: string;
  category?: string;
  price: number;
  unit?: string;
  packageSize?: string;
  imageUrl?: string;
  isActive?: boolean;
  stock?: number | null;
  tierPrices?: Map<string, number> | Record<string, number> | null;
  createdAt?: Date;
};

function toCatalogProduct(p: ProductLeanForCatalog): CatalogProduct {
  const tierPrices =
    p.tierPrices instanceof Map
      ? Object.fromEntries(p.tierPrices)
      : p.tierPrices && typeof p.tierPrices === "object"
        ? (p.tierPrices as Record<string, number>)
        : undefined;
  return {
    _id: String(p._id),
    name: p.name,
    sku: p.sku,
    category: p.category ?? "",
    price: p.price,
    unit: p.unit ?? "",
    packageSize: p.packageSize ?? "",
    imageUrl: p.imageUrl ?? "",
    isActive: p.isActive !== false,
    stock: typeof p.stock === "number" ? p.stock : null,
    ...(tierPrices && Object.keys(tierPrices).length > 0 ? { tierPrices } : {}),
    createdAt: p.createdAt ? new Date(p.createdAt).toISOString() : "",
  };
}

/**
 * Cached catalog page. The catalog changes rarely (admin edits, nightly sync)
 * so it's cached under the "products" tag; per-customer pricing is applied
 * OUTSIDE the cache, per request. Invalidated by revalidateTag("products") in
 * admin product mutations and via POST /api/products/revalidate (sync script);
 * the TTL bounds staleness if neither fires.
 */
const fetchCatalogPageCached = unstable_cache(
  async (category: string, search: string, page: number, pageSize: number, sort: string): Promise<CatalogPage> => {
    await connectDB();
    const filter: Record<string, unknown> = { isActive: true };
    if (category) filter.category = category;
    if (search) {
      const rx = new RegExp(escapeRegex(search), "i");
      filter.$or = [{ name: rx }, { sku: rx }];
    }
    const [total, docs] = await Promise.all([
      ProductModel.countDocuments(filter).exec(),
      ProductModel.find(filter)
        .sort(resolveCatalogSort(sort))
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean()
        .exec() as unknown as Promise<ProductLeanForCatalog[]>,
    ]);
    return {
      items: docs.map(toCatalogProduct),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  },
  ["catalog-page"],
  { tags: [PRODUCTS_CACHE_TAG], revalidate: CATALOG_CACHE_TTL_SECONDS }
);

export async function listCatalogProducts(params: {
  category?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  sort?: string;
}): Promise<CatalogPage> {
  const page = Math.max(1, Math.floor(params.page ?? 1));
  const pageSize = Math.min(
    CATALOG_MAX_PAGE_SIZE,
    Math.max(1, Math.floor(params.pageSize ?? CATALOG_MAX_PAGE_SIZE))
  );
  const sort = (CATALOG_SORT_OPTIONS as readonly string[]).includes(params.sort ?? "") ? params.sort! : "default";
  return fetchCatalogPageCached(params.category?.trim() ?? "", params.search?.trim() ?? "", page, pageSize, sort);
}

const createProductSchema = z.object({
  name: z.string().trim().min(1, "Product name is required."),
  sku: z.string().trim().min(1, "SKU is required."),
  category: z.string().trim().optional().default(""),
  price: z.number().gt(0, "Price must be greater than 0."),
  unit: z.string().trim().optional().default(""),
  packageSize: z.string().trim().optional().default(""),
  imageUrl: z.string().trim().optional().default(""),
  isActive: z.boolean().optional().default(true),
});

const updateProductSchema = z
  .object({
    name: z.string().trim().min(1, "Product name is required.").optional(),
    sku: z.string().trim().min(1, "SKU is required.").optional(),
    category: z.string().trim().optional(),
    price: z.number().gt(0, "Price must be greater than 0.").optional(),
    unit: z.string().trim().optional(),
    packageSize: z.string().trim().optional(),
    imageUrl: z.string().trim().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required for update.",
  });

function formatProductError(error: unknown) {
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message ?? "Invalid product input.";
  }

  if (error instanceof Error && "code" in error && (error as { code?: number }).code === 11000) {
    return "SKU already exists.";
  }

  return error instanceof Error ? error.message : "Unexpected product error.";
}

export async function getAllProducts() {
  await connectDB();
  return ProductModel.find({ isActive: true }).sort({ createdAt: -1 }).lean();
}

export async function getProductsByCategory(categorySlug: string) {
  await connectDB();
  const slug = categorySlug.trim();
  return ProductModel.find({ isActive: true, category: slug }).sort({ createdAt: -1 }).lean();
}

export async function createProduct(input: unknown) {
  await connectDB();

  try {
    const payload = createProductSchema.parse(input);
    const created = await ProductModel.create({
      ...payload,
      sku: payload.sku.toUpperCase(),
    });
    return created.toObject();
  } catch (error) {
    throw new Error(formatProductError(error));
  }
}

export async function getProductById(id: string) {
  if (!isValidObjectId(id)) {
    throw new Error("Invalid product id.");
  }

  await connectDB();
  const product = await ProductModel.findById(id).lean();
  if (!product) {
    throw new Error("Product not found.");
  }
  return product;
}

export async function updateProduct(id: string, input: unknown) {
  if (!isValidObjectId(id)) {
    throw new Error("Invalid product id.");
  }

  await connectDB();

  try {
    const payload = updateProductSchema.parse(input);
    const nextPayload = payload.sku
      ? { ...payload, sku: payload.sku.toUpperCase() }
      : payload;
    const updated = await ProductModel.findByIdAndUpdate(id, nextPayload, {
      returnDocument: "after",
      runValidators: true,
    }).lean();

    if (!updated) {
      throw new Error("Product not found.");
    }

    return updated;
  } catch (error) {
    throw new Error(formatProductError(error));
  }
}

export async function seedMockProducts() {
  await connectDB();

  const mockProducts = [
    {
      name: "Premium Basmati Rice",
      sku: "RICE-001",
      category: "Grains",
      price: 29.9,
      unit: "kg",
      packageSize: "5kg",
      imageUrl: "",
      isActive: true,
    },
    {
      name: "Sunflower Oil",
      sku: "OIL-001",
      category: "Oils",
      price: 18.5,
      unit: "liter",
      packageSize: "2L",
      imageUrl: "",
      isActive: true,
    },
    {
      name: "Tomato Paste",
      sku: "CANNED-001",
      category: "Canned",
      price: 6.75,
      unit: "piece",
      packageSize: "400g",
      imageUrl: "",
      isActive: true,
    },
    {
      name: "Whole Wheat Flour",
      sku: "FLOUR-001",
      category: "Baking",
      price: 14.2,
      unit: "kg",
      packageSize: "2kg",
      imageUrl: "",
      isActive: true,
    },
    {
      name: "Instant Coffee",
      sku: "COFFEE-001",
      category: "Beverages",
      price: 22.0,
      unit: "jar",
      packageSize: "200g",
      imageUrl: "",
      isActive: true,
    },
    {
      name: "Black Tea",
      sku: "TEA-001",
      category: "Beverages",
      price: 12.3,
      unit: "box",
      packageSize: "100 bags",
      imageUrl: "",
      isActive: true,
    },
  ];

  let inserted = 0;
  for (const item of mockProducts) {
    const exists = await ProductModel.findOne({ sku: item.sku }).lean();
    if (!exists) {
      await ProductModel.create(item);
      inserted += 1;
    }
  }

  return { inserted, total: mockProducts.length };
}

