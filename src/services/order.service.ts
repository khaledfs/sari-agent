import mongoose, { isValidObjectId } from "mongoose";

import { connectDB } from "@/lib/db";
import { clearCart, getCartByUserId } from "@/services/cart.service";
import { OrderModel } from "@/models/order.model";

export type OrderItemSnapshot = {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  lineTotal: number;
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
};

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
};

function serializeOrder(doc: {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  items: OrderItemRow[];
  total: number;
  status: string;
  createdAt?: Date;
}): OrderDetail {
  const items: OrderItemSnapshot[] = (doc.items ?? []).map((row) => {
    const lineTotal = Math.round(row.price * row.quantity * 100) / 100;
    return {
      productId: String(row.productId),
      name: row.name,
      price: row.price,
      quantity: row.quantity,
      lineTotal,
    };
  });
  return {
    id: String(doc._id),
    userId: String(doc.userId),
    items,
    total: doc.total,
    status: doc.status,
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : new Date(0).toISOString(),
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
 * Creates an order from the current cart snapshot, then clears the cart.
 * Rolls back the order if clearing the cart fails.
 */
export async function createOrderFromCart(userId: string): Promise<OrderDetail> {
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
  }> = [];

  for (const line of cart.items) {
    if (line.quantity < 1 || !Number.isFinite(line.quantity)) {
      throw new Error("Invalid quantity in cart.");
    }
    const name = line.product.name?.trim();
    if (!name) {
      throw new Error("Invalid product data in cart.");
    }
    const price = line.product.price;
    if (!Number.isFinite(price) || price < 0) {
      throw new Error("Invalid product price in cart.");
    }
    snapshotItems.push({
      productId: new mongoose.Types.ObjectId(line.productId),
      name,
      price,
      quantity: line.quantity,
    });
  }

  const total = Math.round(cart.cartTotal * 100) / 100;

  await connectDB();
  let created;
  try {
    created = await OrderModel.create({
      userId: uid,
      items: snapshotItems,
      total,
      status: "pending",
    });
  } catch (e) {
    throw e instanceof Error ? e : new Error("Failed to create order.");
  }

  try {
    await clearCart(userId);
  } catch (clearErr) {
    await OrderModel.deleteOne({ _id: created._id }).exec();
    throw clearErr instanceof Error ? clearErr : new Error("Failed to finalize order.");
  }

  const saved = await OrderModel.findById(created._id).lean();
  if (!saved) {
    throw new Error("Order not found after creation.");
  }
  return serializeOrder({
    _id: saved._id as mongoose.Types.ObjectId,
    userId: saved.userId as mongoose.Types.ObjectId,
    items: (saved.items ?? []) as OrderItemRow[],
    total: saved.total,
    status: saved.status,
    createdAt: saved.createdAt as Date,
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
  });
}
