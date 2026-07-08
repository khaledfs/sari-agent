import mongoose, { isValidObjectId } from "mongoose";
import { z } from "zod";

import { connectDB } from "@/lib/db";
import { CartModel } from "@/models/cart.model";
import { ProductModel } from "@/models/product.model";

const addBodySchema = z.object({
  productId: z.string().min(1, "productId is required."),
  quantity: z.number().positive("quantity must be a positive number."),
});

const updateBodySchema = z.object({
  productId: z.string().min(1, "productId is required."),
  quantity: z.number(),
});

const productIdOnlySchema = z.object({
  productId: z.string().min(1, "productId is required."),
});

export type CartLineItem = {
  productId: string;
  quantity: number;
  lineTotal: number;
  product: {
    name: string;
    sku: string;
    price: number;
    unit: string;
    imageUrl: string;
  };
};

export type CartWithTotals = {
  cartId: string;
  userId: string;
  items: CartLineItem[];
  cartTotal: number;
};

function toUserObjectId(userId: string) {
  if (!isValidObjectId(userId)) {
    throw new Error("Invalid user id.");
  }
  return new mongoose.Types.ObjectId(userId);
}

async function assertActiveProduct(productId: string) {
  if (!isValidObjectId(productId)) {
    throw new Error("Invalid product id.");
  }
  const product = await ProductModel.findById(productId).lean();
  if (!product) {
    throw new Error("Product not found.");
  }
  if (!product.isActive) {
    throw new Error("Product is not available.");
  }
  return product;
}

async function getOrCreateCartDoc(userId: string) {
  await connectDB();
  const uid = toUserObjectId(userId);
  let cart = await CartModel.findOne({ userId: uid }).exec();
  if (!cart) {
    cart = await CartModel.create({ userId: uid, items: [] });
  }
  return cart;
}

type CartItemPlain = { productId: mongoose.Types.ObjectId; quantity: number };

function snapshotPlainItems(cart: { items?: Array<{ productId: mongoose.Types.ObjectId; quantity: number }> }): CartItemPlain[] {
  return (cart.items ?? []).map((row) => ({
    productId: row.productId,
    quantity: row.quantity,
  }));
}

async function persistCartItems(cartId: mongoose.Types.ObjectId, items: CartItemPlain[]) {
  await CartModel.updateOne({ _id: cartId }, { $set: { items } });
}

function buildCartWithTotals(
  cartId: string,
  userId: string,
  items: Array<{ productId: mongoose.Types.ObjectId; quantity: number }>,
  productById: Map<
    string,
    { name: string; sku: string; price: number; unit: string; imageUrl: string }
  >
): CartWithTotals {
  const lines: CartLineItem[] = [];
  let cartTotal = 0;

  for (const row of items) {
    const pid = String(row.productId);
    const product = productById.get(pid);
    if (!product) {
      continue;
    }
    const lineTotal = Math.round(product.price * row.quantity * 100) / 100;
    cartTotal = Math.round((cartTotal + lineTotal) * 100) / 100;
    lines.push({
      productId: pid,
      quantity: row.quantity,
      lineTotal,
      product: {
        name: product.name,
        sku: product.sku,
        price: product.price,
        unit: product.unit,
        imageUrl: product.imageUrl,
      },
    });
  }

  return { cartId, userId, items: lines, cartTotal };
}

async function loadProductsForItems(
  items: Array<{ productId: mongoose.Types.ObjectId; quantity: number }>
) {
  const ids = items.map((i) => i.productId);
  if (ids.length === 0) {
    return new Map<
      string,
      { name: string; sku: string; price: number; unit: string; imageUrl: string }
    >();
  }
  const products = await ProductModel.find({ _id: { $in: ids } }).lean();
  const map = new Map<
    string,
    { name: string; sku: string; price: number; unit: string; imageUrl: string }
  >();
  for (const p of products) {
    map.set(String(p._id), {
      name: p.name,
      sku: p.sku,
      price: p.price,
      unit: p.unit ?? "",
      imageUrl: p.imageUrl ?? "",
    });
  }
  return map;
}

export async function getCartByUserId(userId: string): Promise<CartWithTotals> {
  toUserObjectId(userId);
  const cart = await getOrCreateCartDoc(userId);
  const items = cart.items ?? [];
  const productById = await loadProductsForItems(items);
  return buildCartWithTotals(String(cart._id), userId, items, productById);
}

export async function addToCart(userId: string, productId: string, quantity: number) {
  addBodySchema.parse({ productId, quantity });
  await assertActiveProduct(productId);

  const cart = await getOrCreateCartDoc(userId);
  const pid = new mongoose.Types.ObjectId(productId);
  const items = snapshotPlainItems(cart);
  const idx = items.findIndex((i) => String(i.productId) === productId);

  if (idx >= 0) {
    items[idx] = {
      productId: items[idx].productId,
      quantity: items[idx].quantity + quantity,
    };
  } else {
    items.push({ productId: pid, quantity });
  }

  await persistCartItems(cart._id, items);

  return getCartByUserId(userId);
}

export async function updateCartItem(userId: string, productId: string, quantity: number) {
  updateBodySchema.parse({ productId, quantity });

  if (!isValidObjectId(productId)) {
    throw new Error("Invalid product id.");
  }

  const cart = await getOrCreateCartDoc(userId);
  const items = snapshotPlainItems(cart);
  const idx = items.findIndex((i) => String(i.productId) === productId);

  if (idx < 0) {
    throw new Error("Item not in cart.");
  }

  if (quantity <= 0) {
    items.splice(idx, 1);
  } else {
    await assertActiveProduct(productId);
    items[idx] = { productId: items[idx].productId, quantity };
  }

  await persistCartItems(cart._id, items);

  return getCartByUserId(userId);
}

export async function removeCartItem(userId: string, productId: string) {
  productIdOnlySchema.parse({ productId });
  if (!isValidObjectId(productId)) {
    throw new Error("Invalid product id.");
  }

  const uid = toUserObjectId(userId);
  await connectDB();
  const cart = await CartModel.findOne({ userId: uid });
  if (!cart) {
    return getCartByUserId(userId);
  }

  const items = snapshotPlainItems(cart).filter((i) => String(i.productId) !== productId);
  await persistCartItems(cart._id, items);

  return getCartByUserId(userId);
}

export async function clearCart(userId: string) {
  toUserObjectId(userId);
  const cart = await getOrCreateCartDoc(userId);
  await persistCartItems(cart._id, []);

  return getCartByUserId(userId);
}
