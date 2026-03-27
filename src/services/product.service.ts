import { isValidObjectId } from "mongoose";
import { z } from "zod";

import { connectDB } from "@/lib/db";
import { ProductModel } from "@/models/product.model";

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

