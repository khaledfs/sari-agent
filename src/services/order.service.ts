import mongoose, { isValidObjectId } from "mongoose";

import { connectDB } from "@/lib/db";
import { CartModel } from "@/models/cart.model";
import { clearCart, getCartByUserId } from "@/services/cart.service";
import { publishRealtimeEvent } from "@/services/event-bus.service";
import type { PriceBreakdown } from "@/services/pricing.service";
import {
  evaluatePromotionsForCart,
  type PromotionEvaluation,
} from "@/services/promotions.service";
import { OrderModel } from "@/models/order.model";
import { ProductModel } from "@/models/product.model";

export type OrderItemSnapshot = {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  lineTotal: number;
  /** Pricing-engine audit snapshot (absent on legacy orders). */
  priceBreakdown?: PriceBreakdown;
  /** Promotion gift line (price 0). */
  isGift?: boolean;
  promotionId?: string;
};

export type OrderSummary = {
  id: string;
  userId: string;
  total: number;
  status: string;
  createdAt: string;
};

export type OrderDetail = {
  id: string;
  userId: string;
  items: OrderItemSnapshot[];
  total: number;
  status: string;
  createdAt: string;
  /** Optional delivery notes the customer entered at checkout. */
  notes?: string;
  appliedPromotionIds?: string[];
  promotionDiscount?: {
    promotionId: string;
    discountType: string;
    value: number;
    amountOff: number;
  };
};

/** Max length for customer delivery notes (mirrors the schema maxlength). */
export const ORDER_NOTES_MAX_LENGTH = 500;

function toUserObjectId(userId: string) {
  if (!isValidObjectId(userId)) {
    throw new Error("Invalid user id.");
  }
  return new mongoose.Types.ObjectId(userId);
}

type OrderItemRow = {
  productId: mongoose.Types.ObjectId;
  name: string;
  price: number;
  quantity: number;
  priceBreakdown?: PriceBreakdown;
  isGift?: boolean;
  promotionId?: string;
};

function serializeOrder(doc: {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  items: OrderItemRow[];
  total: number;
  status: string;
  createdAt?: Date;
  notes?: string;
  appliedPromotionIds?: string[];
  promotionDiscount?: OrderDetail["promotionDiscount"];
}): OrderDetail {
  const items: OrderItemSnapshot[] = (doc.items ?? []).map((row) => {
    const lineTotal = Math.round(row.price * row.quantity * 100) / 100;
    return {
      productId: String(row.productId),
      name: row.name,
      price: row.price,
      quantity: row.quantity,
      lineTotal,
      ...(row.priceBreakdown ? { priceBreakdown: row.priceBreakdown } : {}),
      ...(row.isGift ? { isGift: true } : {}),
      ...(row.promotionId ? { promotionId: row.promotionId } : {}),
    };
  });
  return {
    id: String(doc._id),
    userId: String(doc.userId),
    items,
    total: doc.total,
    status: doc.status,
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : new Date(0).toISOString(),
    ...(doc.notes ? { notes: doc.notes } : {}),
    ...(doc.appliedPromotionIds?.length ? { appliedPromotionIds: doc.appliedPromotionIds } : {}),
    ...(doc.promotionDiscount ? { promotionDiscount: doc.promotionDiscount } : {}),
  };
}

function toSummary(detail: OrderDetail): OrderSummary {
  return {
    id: detail.id,
    userId: detail.userId,
    total: detail.total,
    status: detail.status,
    createdAt: detail.createdAt,
  };
}

/**
 * Creates an order from the current cart snapshot and clears the cart
 * ATOMICALLY.
 *
 * Atomicity audit (checkout flow rebuild): the original implementation was
 * create-order → clear-cart with a compensating delete on failure. That
 * covered the clear-cart failure path but left a crash window between the two
 * writes (order saved, cart still full). Both writes now run in a single
 * MongoDB transaction (Atlas replica set), so either both commit or neither
 * does. If the deployment ever runs against a standalone MongoDB (no
 * transaction support), the code falls back to the previous
 * compensating-delete behavior rather than failing outright.
 */
export async function createOrderFromCart(userId: string, notes = ""): Promise<OrderDetail> {
  const uid = toUserObjectId(userId);
  const cart = await getCartByUserId(userId);

  if (!cart.items.length || cart.cartTotal <= 0) {
    throw new Error("Cart is empty.");
  }

  const snapshotItems: Array<{
    productId: mongoose.Types.ObjectId;
    name: string;
    price: number;
    quantity: number;
    priceBreakdown?: PriceBreakdown;
    isGift?: boolean;
    promotionId?: string;
  }> = [];

  for (const line of cart.items) {
    if (line.quantity < 1 || !Number.isFinite(line.quantity)) {
      throw new Error("Invalid quantity in cart.");
    }
    const name = line.product.name?.trim();
    if (!name) {
      throw new Error("Invalid product data in cart.");
    }
    // Cart line prices come from the pricing engine (see cart.service), so the
    // order snapshots the COMPUTED price plus its audit breakdown.
    const price = line.product.price;
    if (!Number.isFinite(price) || price < 0) {
      throw new Error("Invalid product price in cart.");
    }
    snapshotItems.push({
      productId: new mongoose.Types.ObjectId(line.productId),
      name,
      price,
      quantity: line.quantity,
      ...(line.priceBreakdown ? { priceBreakdown: line.priceBreakdown } : {}),
    });
  }

  let total = Math.round(cart.cartTotal * 100) / 100;

  // Promotions compose on top of the priced cart: gift lines at ₪0 with a
  // promotionId reference, plus at most one order-level discount. Fail soft —
  // a promotions outage must never block order placement (order proceeds
  // without promotion benefits).
  let promoEvaluation: PromotionEvaluation | null = null;
  try {
    promoEvaluation = await evaluatePromotionsForCart(
      userId,
      cart.items.map((l) => ({ productId: l.productId, quantity: l.quantity })),
      total
    );
  } catch {
    promoEvaluation = null;
  }

  if (promoEvaluation) {
    if (promoEvaluation.gifts.length > 0) {
      const giftProducts = await ProductModel.find(
        { _id: { $in: promoEvaluation.gifts.map((g) => g.productId).filter((id) => isValidObjectId(id)) } },
        { name: 1 }
      )
        .lean()
        .exec();
      const nameById = new Map(giftProducts.map((p) => [String(p._id), p.name]));
      for (const gift of promoEvaluation.gifts) {
        const name = nameById.get(gift.productId);
        if (!name) continue; // gift product vanished — skip, never block the order
        snapshotItems.push({
          productId: new mongoose.Types.ObjectId(gift.productId),
          name,
          price: 0,
          quantity: gift.qty,
          isGift: true,
          promotionId: gift.promotionId,
        });
      }
    }
    if (promoEvaluation.orderDiscount) {
      total = Math.max(0, Math.round((total - promoEvaluation.orderDiscount.amountOff) * 100) / 100);
    }
  }

  const trimmedNotes = notes.trim().slice(0, ORDER_NOTES_MAX_LENGTH);
  const orderDoc = {
    userId: uid,
    items: snapshotItems,
    total,
    status: "pending",
    ...(trimmedNotes ? { notes: trimmedNotes } : {}),
    ...(promoEvaluation?.appliedPromotionIds.length
      ? { appliedPromotionIds: promoEvaluation.appliedPromotionIds }
      : {}),
    ...(promoEvaluation?.orderDiscount ? { promotionDiscount: promoEvaluation.orderDiscount } : {}),
  };

  await connectDB();
  let createdId: mongoose.Types.ObjectId | null = null;

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const [created] = await OrderModel.create([orderDoc], { session });
      createdId = created._id as mongoose.Types.ObjectId;
      await CartModel.updateOne({ userId: uid }, { $set: { items: [] } }, { session });
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    const transactionsUnsupported =
      message.includes("Transaction numbers are only allowed") ||
      message.includes("does not support transactions") ||
      message.includes("Transactions are not supported");
    if (!transactionsUnsupported) {
      throw e instanceof Error ? e : new Error("Failed to create order.");
    }

    // Standalone-Mongo fallback: original compensating behavior.
    createdId = null;
    const created = await OrderModel.create(orderDoc);
    createdId = created._id as mongoose.Types.ObjectId;
    try {
      await clearCart(userId);
    } catch (clearErr) {
      await OrderModel.deleteOne({ _id: createdId }).exec();
      throw clearErr instanceof Error ? clearErr : new Error("Failed to finalize order.");
    }
  } finally {
    await session.endSession();
  }

  if (!createdId) {
    throw new Error("Failed to create order.");
  }

  const saved = await OrderModel.findById(createdId).lean();
  if (!saved) {
    throw new Error("Order not found after creation.");
  }

  // Realtime: publish AFTER the transaction committed (admin channel only).
  publishRealtimeEvent({
    type: "order.created",
    orderId: String(saved._id),
    userId,
    total: saved.total,
  });

  return serializeOrder({
    _id: saved._id as mongoose.Types.ObjectId,
    userId: saved.userId as mongoose.Types.ObjectId,
    items: (saved.items ?? []) as OrderItemRow[],
    total: saved.total,
    status: saved.status,
    createdAt: saved.createdAt as Date,
    notes: (saved as { notes?: string }).notes,
    appliedPromotionIds: (saved as { appliedPromotionIds?: string[] }).appliedPromotionIds,
    promotionDiscount: (saved as { promotionDiscount?: OrderDetail["promotionDiscount"] }).promotionDiscount,
  });
}

export async function getOrdersByUser(userId: string): Promise<OrderSummary[]> {
  toUserObjectId(userId);
  await connectDB();
  const uid = toUserObjectId(userId);
  const rows = await OrderModel.find({ userId: uid }).sort({ createdAt: -1 }).lean().exec();

  return rows.map((r) =>
    toSummary(
      serializeOrder({
        _id: r._id as mongoose.Types.ObjectId,
        userId: r.userId as mongoose.Types.ObjectId,
        items: (r.items ?? []) as OrderItemRow[],
        total: r.total,
        status: r.status,
        createdAt: r.createdAt as Date,
      })
    )
  );
}

export async function getOrderById(userId: string, orderId: string): Promise<OrderDetail> {
  toUserObjectId(userId);
  if (!isValidObjectId(orderId)) {
    throw new Error("Order not found.");
  }
  await connectDB();
  const uid = toUserObjectId(userId);
  const oid = new mongoose.Types.ObjectId(orderId);

  const doc = await OrderModel.findOne({ _id: oid, userId: uid }).lean().exec();
  if (!doc) {
    throw new Error("Order not found.");
  }

  return serializeOrder({
    _id: doc._id as mongoose.Types.ObjectId,
    userId: doc.userId as mongoose.Types.ObjectId,
    items: (doc.items ?? []) as OrderItemRow[],
    total: doc.total,
    status: doc.status,
    createdAt: doc.createdAt as Date,
    notes: (doc as { notes?: string }).notes,
    appliedPromotionIds: (doc as { appliedPromotionIds?: string[] }).appliedPromotionIds,
    promotionDiscount: (doc as { promotionDiscount?: OrderDetail["promotionDiscount"] }).promotionDiscount,
  });
}
