import mongoose from "mongoose";

import { requireAdmin } from "@/lib/auth-user";
import { connectDB } from "@/lib/db";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/order-constants";
import { OrderModel } from "@/models/order.model";
import { UserModel } from "@/models/user.model";

export { ORDER_STATUSES, type OrderStatus };

export type AdminOrderRow = {
  _id: string;
  customerName: string;
  customerEmail: string;
  itemCount: number;
  total: number;
  status: string;
  createdAt: string;
};

export async function listAdminOrders(statusFilter?: string): Promise<AdminOrderRow[]> {
  await requireAdmin();
  await connectDB();

  const query =
    statusFilter && (ORDER_STATUSES as readonly string[]).includes(statusFilter)
      ? { status: statusFilter }
      : {};

  const orders = await OrderModel.find(query).sort({ createdAt: -1 }).limit(300).lean().exec();

  const userIds = [...new Set(orders.map((o) => String(o.userId)))];
  const users = await UserModel.find({ _id: { $in: userIds } }, { businessName: 1, email: 1 })
    .lean()
    .exec();
  const userMap = new Map(users.map((u) => [String(u._id), u]));

  return orders.map((o) => {
    const user = userMap.get(String(o.userId));
    return {
      _id: String(o._id),
      customerName: user?.businessName || "—",
      customerEmail: user?.email || "—",
      itemCount: (o.items ?? []).length,
      total: o.total,
      status: o.status,
      createdAt: o.createdAt instanceof Date ? o.createdAt.toISOString() : String(o.createdAt),
    };
  });
}

export async function setAdminOrderStatus(orderId: string, status: string): Promise<void> {
  await requireAdmin();
  if (!(ORDER_STATUSES as readonly string[]).includes(status)) {
    throw new Error("Invalid status.");
  }
  if (!mongoose.isValidObjectId(orderId)) {
    throw new Error("Invalid order id.");
  }
  await connectDB();
  const updated = await OrderModel.findByIdAndUpdate(orderId, { status }).lean().exec();
  if (!updated) throw new Error("Order not found.");
}
