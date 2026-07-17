import mongoose, { isValidObjectId } from "mongoose";

import { assertCanActOnCustomer, resolveActorScope, scopedCustomerObjectIds } from "@/lib/actor-scope";
import { connectDB } from "@/lib/db";
import {
  ADJUSTMENT_NOT_ALLOWED_MESSAGE,
  adjustmentDelta,
  assertValidSupplied,
  isOrderAdjustable,
  recomputeOrderTotal,
  suppliedQty,
  type AdjustableLine,
} from "@/lib/order-adjustment";
import { CustomerMemoryModel } from "@/models/customer-memory.model";
import { LedgerEntryModel } from "@/models/ledger-entry.model";
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
  /** True once any line was supply-adjusted (list badge). */
  adjusted: boolean;
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

type LineAdjustmentLean = {
  fromQuantity: number;
  toQuantity: number;
  note?: string;
  changedAt: Date;
  changedByUserId: string;
  changedByRole: string;
};

type OrderItemLean = {
  productId?: mongoose.Types.ObjectId;
  name?: string;
  price?: number;
  quantity: number;
  priceBreakdown?: PriceBreakdownLean;
  isGift?: boolean;
  promotionId?: string;
  suppliedQuantity?: number;
  adjustmentNote?: string;
  adjustmentHistory?: LineAdjustmentLean[];
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
  adjusted?: boolean;
  adjustedAt?: Date;
  adjustmentRevision?: number;
};

export type AdminOrderDetailItem = {
  productId: string;
  /** Name at order time (stored snapshot — never the live product). */
  name: string;
  /** Unit price at order time (stored snapshot). */
  unitPrice: number;
  /** Ordered quantity (immutable evidence). */
  quantity: number;
  /** Actually-supplied quantity (defaults to ordered until adjusted). */
  suppliedQuantity: number;
  /** Line total from the SUPPLIED quantity at the snapshot price. */
  lineTotal: number;
  adjustmentNote: string | null;
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
  /** True once any line's supplied quantity was adjusted. */
  adjusted: boolean;
  adjustedAt: string | null;
  /** Sum of ORDERED-quantity line totals (what the customer originally owed). */
  orderedTotal: number;
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
    const supplied = suppliedQty({ quantity, suppliedQuantity: it.suppliedQuantity });
    const meta = it.productId ? productsById.get(String(it.productId)) : undefined;
    return {
      productId: it.productId ? String(it.productId) : "",
      name: it.name ?? "",
      unitPrice,
      quantity,
      suppliedQuantity: supplied,
      lineTotal: round2(unitPrice * supplied),
      adjustmentNote: it.adjustmentNote ?? null,
      isGift: it.isGift === true,
      promotionId: it.promotionId ?? null,
      priceBreakdown: it.priceBreakdown ?? null,
      imageUrl: meta?.imageUrl || null,
      sku: meta?.sku || null,
      unit: meta?.unit || null,
      packageSize: meta?.packageSize || null,
    };
  });

  const orderedTotal = round2((order.items ?? []).reduce((n, it) => {
    const price = Number.isFinite(it.price) ? (it.price as number) : 0;
    const qty = Number.isFinite(it.quantity) ? it.quantity : 0;
    return n + price * qty;
  }, 0));

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
    adjusted: order.adjusted === true,
    adjustedAt: order.adjustedAt instanceof Date ? order.adjustedAt.toISOString() : null,
    orderedTotal,
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
    adjusted: o.adjusted === true,
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

export type SupplyAdjustmentInput = {
  /** Zero-based index into order.items — unambiguous even for repeated products. */
  index: number;
  suppliedQuantity: number;
  note?: string;
};

/**
 * Adjusts supplied quantities on an order's lines (warehouse shortage handling).
 *
 * Rules enforced here (see docs): decrease-only (0 ≤ supplied ≤ ordered, >ordered
 * → 400); gift lines are never adjustable (promotions aren't revoked); allowed
 * only pre-dispatch (pending/confirmed/packed), otherwise 403
 * ADJUSTMENT_NOT_ALLOWED; agent scope → 404 on another agent's customer. The
 * ordered quantity is never overwritten; the unit price is never recomputed.
 *
 * The order total (recomputed from SUPPLIED quantities, promotion discount kept)
 * and a compensating ledger credit for the exact delta commit in ONE
 * transaction — an order total and a ledger balance that disagree is the worst
 * outcome, so if the ledger write fails the whole adjustment fails.
 */
export async function adjustOrderSupply(
  orderId: string,
  adjustments: SupplyAdjustmentInput[]
): Promise<AdminOrderDetail> {
  const scope = await resolveActorScope();
  const actor = { userId: scope.userId, role: scope.role } as const;
  if (!isValidObjectId(orderId)) {
    throw new Error("Order not found.");
  }
  if (!Array.isArray(adjustments) || adjustments.length === 0) {
    throw new Error("No adjustments provided.");
  }

  await connectDB();
  const order = (await OrderModel.findById(orderId).lean().exec()) as unknown as OrderLean | null;
  if (!order) {
    throw new Error("Order not found.");
  }
  try {
    assertCanActOnCustomer(scope, String(order.userId));
  } catch {
    throw new Error("Order not found."); // scope violation reads as not-found (no leak)
  }
  if (!isOrderAdjustable(order.status)) {
    throw new Error(ADJUSTMENT_NOT_ALLOWED_MESSAGE);
  }

  const now = new Date();
  const items = (order.items ?? []).map((it) => ({ ...it }));
  let changed = false;

  for (const adj of adjustments) {
    const line = items[adj.index];
    if (!line) {
      throw new Error("Adjustment refers to a line that does not exist.");
    }
    if (line.isGift === true) {
      throw new Error("Gift lines cannot be adjusted."); // promotions are never revoked
    }
    const ordered = Number.isFinite(line.quantity) ? line.quantity : 0;
    const supplied = Math.trunc(Number(adj.suppliedQuantity));
    assertValidSupplied(ordered, supplied); // decrease-only; >ordered → thrown (400)

    const currentSupplied = suppliedQty({ quantity: ordered, suppliedQuantity: line.suppliedQuantity });
    // A short line must never lose its explanation: when the caller omits the
    // note, keep the existing one (only an explicitly-provided string replaces it).
    const noteProvided = adj.note !== undefined && adj.note !== null;
    const note = noteProvided ? String(adj.note).trim().slice(0, 500) : (line.adjustmentNote ?? "");
    if (supplied === currentSupplied && note === (line.adjustmentNote ?? "")) {
      continue; // no-op for this line
    }
    changed = true;
    line.suppliedQuantity = supplied;
    line.adjustmentNote = note || undefined;
    line.adjustmentHistory = [
      ...(line.adjustmentHistory ?? []),
      {
        fromQuantity: currentSupplied,
        toQuantity: supplied,
        note,
        changedAt: now,
        changedByUserId: actor.userId,
        changedByRole: actor.role,
      },
    ];
  }

  // Idempotent on repeat: re-applying the same supplied values changes nothing.
  if (!changed) {
    return getAdminOrderDetail(orderId);
  }

  const asLines: AdjustableLine[] = items.map((it) => ({
    price: Number.isFinite(it.price) ? (it.price as number) : 0,
    quantity: Number.isFinite(it.quantity) ? it.quantity : 0,
    suppliedQuantity: it.suppliedQuantity,
    isGift: it.isGift,
  }));
  const promoOff = order.promotionDiscount?.amountOff ?? 0;
  const previousTotal = order.total;
  const newTotal = recomputeOrderTotal(asLines, promoOff);
  const deltaMajor = adjustmentDelta(previousTotal, newTotal);
  const deltaMinor = toMinorUnits(deltaMajor);
  const revision = (order.adjustmentRevision ?? 0) + 1;
  const idempotencyKey = `order_adjustment:${orderId}:rev${revision}`;

  const orderUpdate = {
    $set: {
      items,
      total: newTotal,
      adjusted: true,
      adjustedAt: now,
      adjustedByUserId: actor.userId,
      adjustedByRole: actor.role,
      adjustmentRevision: revision,
    },
  };

  const session = await mongoose.startSession();
  let ledgerEntryId = "";
  try {
    await session.withTransaction(async () => {
      await OrderModel.updateOne({ _id: new mongoose.Types.ObjectId(orderId) }, orderUpdate, { session });
      if (deltaMinor > 0) {
        const res = await postLedgerEntry({
          userId: String(order.userId),
          type: "refund",
          amountMinor: deltaMinor,
          description: `Supply adjustment #${orderId.slice(-8).toUpperCase()} — credit for shortfall`,
          orderId,
          idempotencyKey,
          actor: { userId: actor.userId, role: actor.role },
          onDuplicate: "ignore",
          session,
          deferPublish: true,
        });
        ledgerEntryId = res.entryId;
      }
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    const transactionsUnsupported =
      message.includes("Transaction numbers are only allowed") ||
      message.includes("does not support transactions") ||
      message.includes("Transactions are not supported");
    if (!transactionsUnsupported) {
      throw e instanceof Error ? e : new Error("Failed to adjust order.");
    }
    // Standalone-Mongo fallback: order first, then ledger; roll back the order
    // total marker if the ledger post fails so the two never disagree.
    await OrderModel.updateOne({ _id: new mongoose.Types.ObjectId(orderId) }, orderUpdate);
    if (deltaMinor > 0) {
      try {
        const res = await postLedgerEntry({
          userId: String(order.userId),
          type: "refund",
          amountMinor: deltaMinor,
          description: `Supply adjustment #${orderId.slice(-8).toUpperCase()} — credit for shortfall`,
          orderId,
          idempotencyKey,
          actor: { userId: actor.userId, role: actor.role },
          onDuplicate: "ignore",
          deferPublish: true,
        });
        ledgerEntryId = res.entryId;
      } catch (ledgerErr) {
        await LedgerEntryModel.deleteOne({ idempotencyKey }).exec();
        await OrderModel.updateOne(
          { _id: new mongoose.Types.ObjectId(orderId) },
          { $set: { items: order.items ?? [], total: previousTotal, adjustmentRevision: order.adjustmentRevision } }
        ).exec();
        throw ledgerErr instanceof Error ? ledgerErr : new Error("Failed to correct the ledger.");
      }
    }
  } finally {
    await session.endSession();
  }

  // Realtime AFTER commit: reuse order.status_changed (owner + admin channels) —
  // status is unchanged, but it carries the orderId so both sides refetch.
  publishRealtimeEvent({
    type: "order.status_changed",
    orderId,
    userId: String(order.userId),
    status: order.status,
    previousStatus: order.status,
  });
  if (ledgerEntryId) {
    publishRealtimeEvent({ type: "ledger.entry_created", userId: String(order.userId), entryId: ledgerEntryId });
  }

  return getAdminOrderDetail(orderId);
}
