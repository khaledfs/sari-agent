import mongoose, { isValidObjectId } from "mongoose";
import { z } from "zod";

import { connectDB } from "@/lib/db";
import { CartModel } from "@/models/cart.model";
import { ProductModel } from "@/models/product.model";
import { computePricesForProducts, type PriceBreakdown } from "@/services/pricing.service";

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
    /** Per-customer price from the pricing engine (equals base when no rules apply). */
    price: number;
    unit: string;
    imageUrl: string;
  };
  /** Pricing-engine audit trail for this line (base/tier/override/discount). */
  priceBreakdown?: PriceBreakdown;
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
  >,
  breakdownById: Map<string, PriceBreakdown>
): CartWithTotals {
  const lines: CartLineItem[] = [];
  let cartTotal = 0;

  for (const row of items) {
    const pid = String(row.productId);
    const product = productById.get(pid);
    if (!product) {
      continue;
    }
    const breakdown = breakdownById.get(pid);
    // Every price the customer pays flows through the pricing engine; the
    // engine returns base price when no rule applies, so this is a no-op
    // for customers without pricing data.
    const unitPrice = breakdown?.final ?? product.price;
    const lineTotal = Math.round(unitPrice * row.quantity * 100) / 100;
    cartTotal = Math.round((cartTotal + lineTotal) * 100) / 100;
    lines.push({
      productId: pid,
      quantity: row.quantity,
      lineTotal,
      product: {
        name: product.name,
        sku: product.sku,
        price: unitPrice,
        unit: product.unit,
        imageUrl: product.imageUrl,
      },
      ...(breakdown ? { priceBreakdown: breakdown } : {}),
    });
  }

  return { cartId, userId, items: lines, cartTotal };
}

type ProductLeanForCart = {
  _id: mongoose.Types.ObjectId;
  name: string;
  sku: string;
  price: number;
  unit?: string;
  imageUrl?: string;
  tierPrices?: Map<string, number> | Record<string, number> | null;
};

async function loadProductsForItems(
  items: Array<{ productId: mongoose.Types.ObjectId; quantity: number }>
): Promise<ProductLeanForCart[]> {
  const ids = items.map((i) => i.productId);
  if (ids.length === 0) {
    return [];
  }
  return (await ProductModel.find({ _id: { $in: ids } }).lean()) as unknown as ProductLeanForCart[];
}

export async function getCartByUserId(userId: string): Promise<CartWithTotals> {
  toUserObjectId(userId);
  const cart = await getOrCreateCartDoc(userId);
  const items = cart.items ?? [];
  const products = await loadProductsForItems(items);
  const breakdownById = await computePricesForProducts(products, userId);
  const productById = new Map(
    products.map((p) => [
      String(p._id),
      {
        name: p.name,
        sku: p.sku,
        price: p.price,
        unit: p.unit ?? "",
        imageUrl: p.imageUrl ?? "",
      },
    ])
  );
  return buildCartWithTotals(String(cart._id), userId, items, productById, breakdownById);
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
