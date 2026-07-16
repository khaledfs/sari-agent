import mongoose, { isValidObjectId } from "mongoose";
import { z } from "zod";

import { connectDB } from "@/lib/db";
import { CartModel } from "@/models/cart.model";
import { ProductModel } from "@/models/product.model";
import { requireOrderingEnabled } from "@/services/account-status.service";
import { computePricesForProducts, type PriceBreakdown } from "@/services/pricing.service";
import {
  evaluatePromotionsForCart,
  type PromotionEvaluation,
} from "@/services/promotions.service";

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
    /** Availability snapshot for the cart UI (realtime inline notices — Issue 4). */
    isActive: boolean;
    /** null = stock not tracked; 0 = tracked and sold out. */
    stock: number | null;
  };
  /** Pricing-engine audit trail for this line (base/tier/override/discount). */
  priceBreakdown?: PriceBreakdown;
};

export type CartPromotionsView = {
  gifts: Array<{
    productId: string;
    name: string;
    imageUrl: string;
    qty: number;
    promotionId: string;
  }>;
  orderDiscount?: PromotionEvaluation["orderDiscount"];
  /** cartTotal minus the order discount (present only when a discount applies). */
  totalAfterDiscount?: number;
  nearestHint?: PromotionEvaluation["nearestHint"];
};

export type CartWithTotals = {
  cartId: string;
  userId: string;
  items: CartLineItem[];
  /** Subtotal of paid lines (before any order-level promotion discount). */
  cartTotal: number;
  /** Earned gifts / order discount / nearest-promotion hint (absent when none). */
  promotions?: CartPromotionsView;
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
  // Task E finding: tracked stock 0 was addable server-side (only the UI
  // disabled it). Sold-out products are now rejected at the source.
  if (typeof product.stock === "number" && product.stock <= 0) {
    throw new Error("Product is out of stock.");
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
    { name: string; sku: string; price: number; unit: string; imageUrl: string; isActive: boolean; stock: number | null }
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
        isActive: product.isActive,
        stock: product.stock,
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
  isActive?: boolean;
  stock?: number | null;
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

/**
 * Attaches earned gifts / order discount / progress hint for the cart page.
 * Fail-soft: a promotions outage must never break the cart itself.
 */
async function loadCartPromotions(
  userId: string,
  cart: CartWithTotals
): Promise<CartPromotionsView | undefined> {
  try {
    const evaluation = await evaluatePromotionsForCart(
      userId,
      cart.items.map((l) => ({ productId: l.productId, quantity: l.quantity })),
      cart.cartTotal
    );
    if (
      evaluation.gifts.length === 0 &&
      !evaluation.orderDiscount &&
      !evaluation.nearestHint
    ) {
      return undefined;
    }

    let gifts: CartPromotionsView["gifts"] = [];
    if (evaluation.gifts.length > 0) {
      const giftProducts = await ProductModel.find(
        { _id: { $in: evaluation.gifts.map((g) => g.productId).filter((id) => isValidObjectId(id)) } },
        { name: 1, imageUrl: 1 }
      )
        .lean()
        .exec();
      const byId = new Map(giftProducts.map((p) => [String(p._id), p]));
      gifts = evaluation.gifts
        .filter((g) => byId.has(g.productId))
        .map((g) => ({
          productId: g.productId,
          name: byId.get(g.productId)?.name ?? "",
          imageUrl: byId.get(g.productId)?.imageUrl ?? "",
          qty: g.qty,
          promotionId: g.promotionId,
        }));
    }

    return {
      gifts,
      ...(evaluation.orderDiscount
        ? {
            orderDiscount: evaluation.orderDiscount,
            totalAfterDiscount: Math.max(
              0,
              Math.round((cart.cartTotal - evaluation.orderDiscount.amountOff) * 100) / 100
            ),
          }
        : {}),
      ...(evaluation.nearestHint ? { nearestHint: evaluation.nearestHint } : {}),
    };
  } catch {
    return undefined;
  }
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
        isActive: p.isActive !== false,
        stock: typeof p.stock === "number" ? p.stock : null,
      },
    ])
  );
  const result = buildCartWithTotals(String(cart._id), userId, items, productById, breakdownById);
  const promotions = await loadCartPromotions(userId, result);
  return promotions ? { ...result, promotions } : result;
}

export async function addToCart(userId: string, productId: string, quantity: number) {
  await requireOrderingEnabled(userId);
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
  await requireOrderingEnabled(userId);
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
  await requireOrderingEnabled(userId);
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
  await requireOrderingEnabled(userId);
  toUserObjectId(userId);
  const cart = await getOrCreateCartDoc(userId);
  await persistCartItems(cart._id, []);

  return getCartByUserId(userId);
}
