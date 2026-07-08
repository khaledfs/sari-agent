import mongoose, { isValidObjectId } from "mongoose";

import { requireAdmin } from "@/lib/auth-user";
import { connectDB } from "@/lib/db";
import { OrderModel } from "@/models/order.model";
import { UserModel } from "@/models/user.model";

/**
 * Canonical order statuses the admin can set. These strings are chosen so the
 * customer-facing timeline (deriveOrderStage in orders/OrderTimeline.tsx) maps
 * each one to exactly one stage: pending→Placed, confirmed→Confirmed,
 * packed→Packed, out_for_delivery→Out for delivery, delivered→Delivered,
 * cancelled→(halted).
 */
export const ADMIN_ORDER_STATUSES = [
  "pending",
  "confirmed",
  "packed",
  "out_for_delivery",
  "delivered",
  "cancelled",
] as const;

export type AdminOrderStatus = (typeof ADMIN_ORDER_STATUSES)[number];

export type AdminOrderRow = {
  id: string;
  customer: { id: string; businessName: string; phoneNumber: string } | null;
  itemCount: number;
  total: number;
  status: string;
  createdAt: string;
};

type OrderLean = {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  items?: Array<{ quantity: number }>;
  total: number;
  status: string;
  createdAt?: Date;
};

type UserLite = { _id: mongoose.Types.ObjectId; businessName: string; phoneNumber: string };

function sumItems(items?: Array<{ quantity: number }>): number {
  return (items ?? []).reduce((n, it) => n + (Number.isFinite(it.quantity) ? it.quantity : 0), 0);
}

function toRow(o: OrderLean, user: UserLite | undefined): AdminOrderRow {
  return {
    id: String(o._id),
    customer: user
      ? { id: String(user._id), businessName: user.businessName, phoneNumber: user.phoneNumber }
      : null,
    itemCount: sumItems(o.items),
    total: o.total,
    status: o.status,
    createdAt: o.createdAt instanceof Date ? o.createdAt.toISOString() : String(o.createdAt ?? ""),
  };
}

/** All orders across every customer, newest first, with the buyer joined in. */
export async function listAdminOrders(): Promise<AdminOrderRow[]> {
  await requireAdmin();
  await connectDB();

  const orders = (await OrderModel.find({}).sort({ createdAt: -1 }).lean().exec()) as unknown as OrderLean[];

  const userIds = [...new Set(orders.map((o) => String(o.userId)))].filter((id) => isValidObjectId(id));
  const users = (await UserModel.find(
    { _id: { $in: userIds.map((id) => new mongoose.Types.ObjectId(id)) } },
    { businessName: 1, phoneNumber: 1 }
  )
    .lean()
    .exec()) as unknown as UserLite[];

  const byId = new Map(users.map((u) => [String(u._id), u]));
  return orders.map((o) => toRow(o, byId.get(String(o.userId))));
}

/** Sets the status on a single order (admin only). Returns the updated row. */
export async function updateAdminOrderStatus(orderId: string, status: string): Promise<AdminOrderRow> {
  await requireAdmin();
  if (!isValidObjectId(orderId)) {
    throw new Error("Order not found.");
  }
  const next = String(status ?? "").trim().toLowerCase();
  if (!(ADMIN_ORDER_STATUSES as readonly string[]).includes(next)) {
    throw new Error("Invalid status.");
  }

  await connectDB();
  const res = await OrderModel.updateOne(
    { _id: new mongoose.Types.ObjectId(orderId) },
    { $set: { status: next } }
  ).exec();
  if (res.matchedCount === 0) {
    throw new Error("Order not found.");
  }

  const o = (await OrderModel.findById(orderId).lean().exec()) as unknown as OrderLean | null;
  if (!o) {
    throw new Error("Order not found.");
  }
  const user = (await UserModel.findById(o.userId, { businessName: 1, phoneNumber: 1 })
    .lean()
    .exec()) as unknown as UserLite | null;
  return toRow(o, user ?? undefined);
}
