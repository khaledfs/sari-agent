import mongoose, { isValidObjectId } from "mongoose";

import { assertCanActOnCustomer, resolveActorScope, scopedCustomerObjectIds } from "@/lib/actor-scope";
import { connectDB } from "@/lib/db";
import { CustomerMemoryModel } from "@/models/customer-memory.model";
import { publishRealtimeEvent } from "@/services/event-bus.service";
import { postLedgerEntry, toMinorUnits } from "@/services/ledger.service";
import { OrderModel } from "@/models/order.model";
import { ProductModel } from "@/models/product.model";
import { UserModel } from "@/models/user.model";
import type { JwtPayload } from "@/types/session";

// Status vocabulary lives in the client-safe module (Work Order Issue 1) so
// server AND client share ONE list; re-exported here for existing importers.
export { ADMIN_ORDER_STATUSES, type AdminOrderStatus } from "@/lib/order-status";
import { ADMIN_ORDER_STATUSES } from "@/lib/order-status";

export type AdminOrderRow = {
  id: string;
  customer: { id: string; businessName: string; phoneNumber: string } | null;
  itemCount: number;
  total: number;
  status: string;
  createdAt: string;
  /** Customer delivery notes from checkout ("" when none). */
  notes: string;
};

export type OrderStatusHistoryEntry = {
  status: string;
  changedAt: string;
  changedByUserId: string;
  changedByRole: string;
};

type PriceBreakdownLean = {
  base: number;
  tier?: number;
  override?: number;
  discountApplied?: { discountId: string; discountType: string; value: number; amountOff: number };
  final: number;
};

type OrderItemLean = {
  productId?: mongoose.Types.ObjectId;
  name?: string;
  price?: number;
  quantity: number;
  priceBreakdown?: PriceBreakdownLean;
  isGift?: boolean;
  promotionId?: string;
};

type OrderLean = {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  items?: OrderItemLean[];
  total: number;
  status: string;
  createdAt?: Date;
  updatedAt?: Date;
  notes?: string;
  appliedPromotionIds?: string[];
  promotionDiscount?: { promotionId: string; discountType: string; value: number; amountOff: number };
  statusHistory?: Array<{ status: string; changedAt: Date; changedByUserId: string; changedByRole: string }>;
};

export type AdminOrderDetailItem = {
  productId: string;
  /** Name at order time (stored snapshot — never the live product). */
  name: string;
  /** Unit price at order time (stored snapshot). */
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  isGift: boolean;
  promotionId: string | null;
  priceBreakdown: PriceBreakdownLean | null;
  /** Best-effort display metadata from the CURRENT product doc (not snapshotted). */
  imageUrl: string | null;
  sku: string | null;
  unit: string | null;
  packageSize: string | null;
};

export type AdminOrderDetail = {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  notes: string;
  items: AdminOrderDetailItem[];
  /** Sum of stored line totals (gifts are ₪0 lines). */
  subtotal: number;
  promotionDiscount: { promotionId: string; discountType: string; value: number; amountOff: number } | null;
  appliedPromotionIds: string[];
  total: number;
  customer: {
    id: string;
    businessName: string;
    phoneNumber: string;
    email: string;
    businessType: string | null;
    adminNotes: string;
  } | null;
  statusHistory: OrderStatusHistoryEntry[];
};

type ProductMetaLean = {
  _id: mongoose.Types.ObjectId;
  sku?: string;
  imageUrl?: string;
  unit?: string;
  packageSize?: string;
};

type UserDetailLean = {
  _id: mongoose.Types.ObjectId;
  businessName?: string;
  phoneNumber?: string;
  email?: string;
  adminNotes?: string;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Pure DTO mapper for the admin order detail (exported for unit tests).
 * Line prices/names come strictly from the order's stored snapshot; the
 * current product doc only contributes display metadata (image/sku/unit).
 */
export function toAdminOrderDetail(
  order: OrderLean,
  user: UserDetailLean | null,
  businessType: string | null,
  productsById: Map<string, ProductMetaLean>
): AdminOrderDetail {
  const items: AdminOrderDetailItem[] = (order.items ?? []).map((it) => {
    const unitPrice = Number.isFinite(it.price) ? (it.price as number) : 0;
    const quantity = Number.isFinite(it.quantity) ? it.quantity : 0;
    const meta = it.productId ? productsById.get(String(it.productId)) : undefined;
    return {
      productId: it.productId ? String(it.productId) : "",
      name: it.name ?? "",
      unitPrice,
      quantity,
      lineTotal: round2(unitPrice * quantity),
      isGift: it.isGift === true,
      promotionId: it.promotionId ?? null,
      priceBreakdown: it.priceBreakdown ?? null,
      imageUrl: meta?.imageUrl || null,
      sku: meta?.sku || null,
      unit: meta?.unit || null,
      packageSize: meta?.packageSize || null,
    };
  });

  return {
    id: String(order._id),
    status: order.status,
    createdAt: order.createdAt instanceof Date ? order.createdAt.toISOString() : String(order.createdAt ?? ""),
    updatedAt: order.updatedAt instanceof Date ? order.updatedAt.toISOString() : String(order.updatedAt ?? ""),
    notes: order.notes ?? "",
    items,
    subtotal: round2(items.reduce((n, it) => n + it.lineTotal, 0)),
    promotionDiscount: order.promotionDiscount ?? null,
    appliedPromotionIds: order.appliedPromotionIds ?? [],
    total: order.total,
    customer: user
      ? {
          id: String(user._id),
          businessName: user.businessName ?? "",
          phoneNumber: user.phoneNumber ?? "",
          email: user.email ?? "",
          businessType,
          adminNotes: user.adminNotes ?? "",
        }
      : null,
    statusHistory: (order.statusHistory ?? []).map((h) => ({
      status: h.status,
      changedAt: h.changedAt instanceof Date ? h.changedAt.toISOString() : String(h.changedAt ?? ""),
      changedByUserId: h.changedByUserId,
      changedByRole: h.changedByRole,
    })),
  };
}

/** Pure builder for a status-history entry (exported for unit tests). */
export function buildStatusHistoryEntry(
  status: string,
  actor: JwtPayload,
  changedAt: Date
): { status: string; changedAt: Date; changedByUserId: string; changedByRole: string } {
  return {
    status,
    changedAt,
    changedByUserId: actor.userId,
    changedByRole: actor.role,
  };
}

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
    notes: o.notes ?? "",
  };
}

/**
 * Orders newest first with the buyer joined in — an ADMIN sees every order,
 * an AGENT sees only orders whose buyer is assigned to them (Task D).
 */
export async function listAdminOrders(): Promise<AdminOrderRow[]> {
  const scope = await resolveActorScope();
  await connectDB();

  const scopedIds = scopedCustomerObjectIds(scope);
  const filter = scopedIds ? { userId: { $in: scopedIds } } : {};
  const orders = (await OrderModel.find(filter).sort({ createdAt: -1 }).lean().exec()) as unknown as OrderLean[];

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

/**
 * Full order detail for the admin drawer — one service call, batched queries
 * (order → user + memory + product metadata), no per-item N+1.
 */
export async function getAdminOrderDetail(orderId: string): Promise<AdminOrderDetail> {
  const scope = await resolveActorScope();
  if (!isValidObjectId(orderId)) {
    throw new Error("Order not found.");
  }
  await connectDB();

  const order = (await OrderModel.findById(orderId).lean().exec()) as unknown as OrderLean | null;
  if (!order) {
    throw new Error("Order not found.");
  }
  // Scope: another agent's customer's order reads as not-found (no leak).
  try {
    assertCanActOnCustomer(scope, String(order.userId));
  } catch {
    throw new Error("Order not found.");
  }

  const productIds = [
    ...new Set(
      (order.items ?? [])
        .map((it) => (it.productId ? String(it.productId) : ""))
        .filter((id) => isValidObjectId(id))
    ),
  ];

  const [user, memory, products] = await Promise.all([
    UserModel.findById(order.userId, { businessName: 1, phoneNumber: 1, email: 1, adminNotes: 1 })
      .lean()
      .exec() as unknown as Promise<UserDetailLean | null>,
    CustomerMemoryModel.findOne({ userId: order.userId })
      .select("businessType")
      .lean()
      .exec() as unknown as Promise<{ businessType?: string } | null>,
    ProductModel.find(
      { _id: { $in: productIds.map((id) => new mongoose.Types.ObjectId(id)) } },
      { sku: 1, imageUrl: 1, unit: 1, packageSize: 1 }
    )
      .lean()
      .exec() as unknown as Promise<ProductMetaLean[]>,
  ]);

  const productsById = new Map(products.map((p) => [String(p._id), p]));
  return toAdminOrderDetail(order, user, memory?.businessType ?? null, productsById);
}

/** Sets the status on a single order (admin or the buyer's agent — Task D). */
export async function updateAdminOrderStatus(orderId: string, status: string): Promise<AdminOrderRow> {
  const scope = await resolveActorScope();
  const actor = { userId: scope.userId, role: scope.role } as const;
  if (!isValidObjectId(orderId)) {
    throw new Error("Order not found.");
  }
  const next = String(status ?? "").trim().toLowerCase();
  if (!(ADMIN_ORDER_STATUSES as readonly string[]).includes(next)) {
    throw new Error("Invalid status.");
  }

  await connectDB();
  const previous = (await OrderModel.findById(orderId, { status: 1, userId: 1 }).lean().exec()) as unknown as {
    status: string;
    userId: mongoose.Types.ObjectId;
  } | null;
  if (!previous) {
    throw new Error("Order not found.");
  }
  try {
    assertCanActOnCustomer(scope, String(previous.userId));
  } catch {
    throw new Error("Order not found.");
  }

  await OrderModel.updateOne(
    { _id: new mongoose.Types.ObjectId(orderId) },
    {
      $set: { status: next },
      $push: { statusHistory: buildStatusHistoryEntry(next, actor, new Date()) },
    }
  ).exec();

  const o = (await OrderModel.findById(orderId).lean().exec()) as unknown as OrderLean | null;
  if (!o) {
    throw new Error("Order not found.");
  }

  // Realtime: after the successful write — admin channel + the owner's channel.
  publishRealtimeEvent({
    type: "order.status_changed",
    orderId: String(o._id),
    userId: String(o.userId),
    status: o.status,
    previousStatus: previous.status,
  });

  // Ledger (Work Order Issue 8): cancelling an order posts a compensating
  // reversal — the original order_charge is never mutated. The idempotency
  // key makes a double-cancel a no-op. Fail-soft: a ledger outage must not
  // block the status change itself (the key allows posting later).
  if (next === "cancelled" && previous.status.toLowerCase() !== "cancelled") {
    try {
      await postLedgerEntry({
        userId: String(o.userId),
        type: "refund",
        amountMinor: toMinorUnits(o.total),
        description: `Order cancelled — reversal #${orderId.slice(-8).toUpperCase()}`,
        orderId,
        idempotencyKey: `order_reversal:${orderId}`,
        actor: { userId: actor.userId, role: actor.role },
        onDuplicate: "ignore",
      });
    } catch {
      console.error(`ledger: failed to post order_reversal for order ${orderId}`);
    }
  }

  const user = (await UserModel.findById(o.userId, { businessName: 1, phoneNumber: 1 })
    .lean()
    .exec()) as unknown as UserLite | null;
  return toRow(o, user ?? undefined);
}
