import mongoose, { isValidObjectId } from "mongoose";

import { connectDB } from "@/lib/db";
import { isReceiptAvailable } from "@/lib/order-status";
import { adjustmentDelta, recomputeOrderTotal, suppliedQty, type AdjustableLine } from "@/lib/order-adjustment";
import {
  assertIntentRateLimit,
  createPaymentIntent,
  isPaymentsEnabled,
  PAYMENTS_DISABLED_MESSAGE,
} from "@/services/payments.service";
import { CartModel } from "@/models/cart.model";
import { UserModel } from "@/models/user.model";
import { requireOrderingEnabled } from "@/services/account-status.service";
import { clearCart, getCartByUserId } from "@/services/cart.service";
import { publishRealtimeEvent } from "@/services/event-bus.service";
import { postLedgerEntry, toMinorUnits } from "@/services/ledger.service";
import { LedgerEntryModel } from "@/models/ledger-entry.model";
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
  /** Ordered quantity (immutable evidence — what the customer asked for). */
  quantity: number;
  /** Actually-supplied quantity (defaults to ordered until adjusted). */
  suppliedQuantity: number;
  /** Line total from the SUPPLIED quantity at the snapshot price. */
  lineTotal: number;
  /** Admin/agent note when this line was short-supplied. */
  adjustmentNote?: string;
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
  /** True once a line was supply-adjusted; unseen = customer hasn't opened it. */
  adjusted?: boolean;
  adjustmentUnseen?: boolean;
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
  /** Supply-adjustment markers (warehouse shortage). */
  adjusted?: boolean;
  adjustedAt?: string;
  /** When the customer acknowledged the adjustment (drives the unseen marker). */
  adjustmentSeenAt?: string;
  /** Payment (never card data). */
  paymentMethod?: "card" | "agent";
  paymentStatus?: "pending" | "paid" | "failed" | "collect_via_agent";
  paidAt?: string;
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
  suppliedQuantity?: number;
  adjustmentNote?: string;
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
  adjusted?: boolean;
  adjustedAt?: Date;
  adjustmentSeenAt?: Date;
  paymentMethod?: "card" | "agent";
  paymentStatus?: "pending" | "paid" | "failed" | "collect_via_agent";
  paidAt?: Date;
}): OrderDetail {
  const items: OrderItemSnapshot[] = (doc.items ?? []).map((row) => {
    const supplied = suppliedQty({ quantity: row.quantity, suppliedQuantity: row.suppliedQuantity });
    const lineTotal = Math.round(row.price * supplied * 100) / 100;
    return {
      productId: String(row.productId),
      name: row.name,
      price: row.price,
      quantity: row.quantity,
      suppliedQuantity: supplied,
      lineTotal,
      ...(row.adjustmentNote ? { adjustmentNote: row.adjustmentNote } : {}),
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
    ...(doc.adjusted ? { adjusted: true } : {}),
    ...(doc.adjustedAt ? { adjustedAt: new Date(doc.adjustedAt).toISOString() } : {}),
    ...(doc.adjustmentSeenAt ? { adjustmentSeenAt: new Date(doc.adjustmentSeenAt).toISOString() } : {}),
    ...(doc.paymentMethod ? { paymentMethod: doc.paymentMethod } : {}),
    ...(doc.paymentStatus ? { paymentStatus: doc.paymentStatus } : {}),
    ...(doc.paidAt ? { paidAt: new Date(doc.paidAt).toISOString() } : {}),
  };
}

function toSummary(detail: OrderDetail): OrderSummary {
  return {
    id: detail.id,
    userId: detail.userId,
    total: detail.total,
    status: detail.status,
    createdAt: detail.createdAt,
    ...(detail.adjusted ? { adjusted: true, adjustmentUnseen: !detail.adjustmentSeenAt } : {}),
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
export type CreateOrderResult = { order: OrderDetail; clientToken?: string };

export async function createOrderFromCart(
  userId: string,
  options: { notes?: string; paymentMethod?: "card" | "agent" } = {}
): Promise<CreateOrderResult> {
  await requireOrderingEnabled(userId); // restricted accounts blocked here — the single source of truth
  const notes = options.notes ?? "";
  const paymentMethod: "card" | "agent" = options.paymentMethod === "card" ? "card" : "agent";
  // Card requires the provider seam to be enabled; agent always works.
  if (paymentMethod === "card") {
    if (!isPaymentsEnabled()) {
      throw new Error(PAYMENTS_DISABLED_MESSAGE);
    }
    assertIntentRateLimit(userId); // throttle card intent creation per user
  }
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
    paymentMethod,
    // Card starts pending (a signed webhook flips it to paid); agent is a
    // cash/cheque collection that the assigned agent settles in person.
    paymentStatus: paymentMethod === "card" ? "pending" : "collect_via_agent",
    ...(trimmedNotes ? { notes: trimmedNotes } : {}),
    ...(promoEvaluation?.appliedPromotionIds.length
      ? { appliedPromotionIds: promoEvaluation.appliedPromotionIds }
      : {}),
    ...(promoEvaluation?.orderDiscount ? { promotionDiscount: promoEvaluation.orderDiscount } : {}),
  };

  await connectDB();
  let createdId: mongoose.Types.ObjectId | null = null;
  let ledgerEntryId = "";

  const session = await mongoose.startSession();
  try {
    // Atomic path: order + cart clear + ledger order_charge commit together
    // (Work Order Issue 8) — or none of them do.
    await session.withTransaction(async () => {
      const [created] = await OrderModel.create([orderDoc], { session });
      createdId = created._id as mongoose.Types.ObjectId;
      await CartModel.updateOne({ userId: uid }, { $set: { items: [] } }, { session });
      const posted = await postLedgerEntry({
        userId,
        type: "order_charge",
        amountMinor: toMinorUnits(total),
        description: `Order charge #${String(createdId).slice(-8).toUpperCase()}`,
        orderId: String(createdId),
        idempotencyKey: `order_charge:${String(createdId)}`,
        onDuplicate: "ignore",
        session,
        deferPublish: true, // published after commit below
      });
      ledgerEntryId = posted.entryId;
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

    // Standalone-Mongo fallback: original compensating behavior, extended so
    // the ledger entry participates (delete order + entry on failure).
    createdId = null;
    const created = await OrderModel.create(orderDoc);
    createdId = created._id as mongoose.Types.ObjectId;
    try {
      const posted = await postLedgerEntry({
        userId,
        type: "order_charge",
        amountMinor: toMinorUnits(total),
        description: `Order charge #${String(createdId).slice(-8).toUpperCase()}`,
        orderId: String(createdId),
        idempotencyKey: `order_charge:${String(createdId)}`,
        onDuplicate: "ignore",
        deferPublish: true,
      });
      ledgerEntryId = posted.entryId;
      await clearCart(userId);
    } catch (fallbackErr) {
      await LedgerEntryModel.deleteOne({ idempotencyKey: `order_charge:${String(createdId)}` }).exec();
      await OrderModel.deleteOne({ _id: createdId }).exec();
      throw fallbackErr instanceof Error ? fallbackErr : new Error("Failed to finalize order.");
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

  // Realtime: publish AFTER the transaction committed.
  publishRealtimeEvent({
    type: "order.created",
    orderId: String(saved._id),
    userId,
    total: saved.total,
  });
  if (ledgerEntryId) {
    publishRealtimeEvent({
      type: "ledger.entry_created",
      userId,
      entryId: ledgerEntryId,
    });
  }

  // Card: create the provider payment intent AFTER the order exists (needs the
  // id) and store the OPAQUE intent id — never card data. The client completes
  // payment with the returned token via the provider's hosted fields; `paid`
  // arrives only through the signed webhook, never this response.
  let clientToken: string | undefined;
  if (paymentMethod === "card") {
    const intent = await createPaymentIntent({ id: String(createdId), amountMinor: toMinorUnits(saved.total) });
    await OrderModel.updateOne({ _id: createdId }, { $set: { paymentIntentId: intent.intentId } }).exec();
    clientToken = intent.clientToken;
  }

  const order = serializeOrder({
    _id: saved._id as mongoose.Types.ObjectId,
    userId: saved.userId as mongoose.Types.ObjectId,
    items: (saved.items ?? []) as OrderItemRow[],
    total: saved.total,
    status: saved.status,
    createdAt: saved.createdAt as Date,
    notes: (saved as { notes?: string }).notes,
    appliedPromotionIds: (saved as { appliedPromotionIds?: string[] }).appliedPromotionIds,
    promotionDiscount: (saved as { promotionDiscount?: OrderDetail["promotionDiscount"] }).promotionDiscount,
    paymentMethod: (saved as { paymentMethod?: "card" | "agent" }).paymentMethod,
    paymentStatus: (saved as { paymentStatus?: OrderDetail["paymentStatus"] }).paymentStatus,
  });
  return { order, clientToken };
}

type CommitItemLean = {
  productId?: mongoose.Types.ObjectId;
  quantity: number;
  suppliedQuantity?: number;
  isGift?: boolean;
  price?: number;
  adjustmentNote?: string;
  adjustmentHistory?: unknown[];
};
type CommitOrderLean = {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  items?: CommitItemLean[];
  total: number;
  status: string;
  adjustmentRevision?: number;
  promotionDiscount?: { amountOff: number };
};

/**
 * Decrements stock EXACTLY ONCE per order (idempotent via stockCommittedAt),
 * atomically per line, never over-committing. Called on the card PAID webhook
 * and on agent DISPATCH — the stamp makes whichever fires second a no-op, and a
 * webhook replay / double dispatch / restart can never decrement twice.
 *
 * Atomic per line: a single pipeline update sets stock = max(0, stock − qty) and
 * returns the pre-image, so two concurrent commits are serialized on the
 * document and can never both take the same units. Untracked stock (null) is
 * skipped. When a line can't be fully committed (accepted oversell — no
 * reservation), we commit what IS available and feed the shortage into the
 * existing supplied-quantity adjustment (supplied down + a compensating ledger
 * credit) instead of failing the payment.
 */
export async function commitOrderStock(orderId: string): Promise<{ committed: boolean; oversold: boolean }> {
  if (!isValidObjectId(orderId)) return { committed: false, oversold: false };
  await connectDB();
  const now = new Date();

  // Claim the commit exactly once — the conditional update serializes concurrent callers.
  const claimed = (await OrderModel.findOneAndUpdate(
    { _id: new mongoose.Types.ObjectId(orderId), stockCommittedAt: { $exists: false } },
    { $set: { stockCommittedAt: now } },
    { new: false }
  )
    .lean()
    .exec()) as CommitOrderLean | null;
  if (!claimed) return { committed: false, oversold: false }; // already committed → no-op

  const items = claimed.items ?? [];
  const shortages: Array<{ index: number; ordered: number; committed: number }> = [];

  for (let i = 0; i < items.length; i += 1) {
    const it = items[i];
    if (!it.productId) continue;
    const qty = suppliedQty({ quantity: it.quantity, suppliedQuantity: it.suppliedQuantity });
    if (!Number.isFinite(qty) || qty <= 0) continue;
    // Atomic floor-at-zero decrement; pre-image tells us how much was actually
    // available. Aggregation-pipeline update — mongoose 9 requires the explicit
    // updatePipeline opt-in for pipeline arrays.
    const pre = (await ProductModel.findOneAndUpdate(
      { _id: it.productId, stock: { $ne: null } },
      [{ $set: { stock: { $max: [0, { $subtract: ["$stock", qty] }] } } }],
      { new: false, updatePipeline: true }
    )
      .lean()
      .exec()) as { stock?: number | null } | null;
    if (!pre) continue; // untracked stock → skipped, never zeroed
    const preStock = typeof pre.stock === "number" ? pre.stock : 0;
    const committedQty = Math.min(preStock, qty);
    if (committedQty < qty) {
      shortages.push({ index: i, ordered: qty, committed: committedQty });
    }
  }

  // Oversell (accepted risk): commit what's available, mark the order as needing
  // adjustment, and post the compensating credit — DO NOT fail the payment.
  if (shortages.length > 0) {
    const newItems = items.map((it, idx) => {
      const sh = shortages.find((s) => s.index === idx);
      if (!sh) return it;
      const from = suppliedQty({ quantity: it.quantity, suppliedQuantity: it.suppliedQuantity });
      return {
        ...it,
        suppliedQuantity: sh.committed,
        adjustmentHistory: [
          ...((it.adjustmentHistory as unknown[]) ?? []),
          { fromQuantity: from, toQuantity: sh.committed, note: "", changedAt: now, changedByUserId: "system", changedByRole: "system" },
        ],
      };
    });
    const asLines: AdjustableLine[] = newItems.map((it) => ({
      price: Number.isFinite(it.price) ? (it.price as number) : 0,
      quantity: it.quantity,
      suppliedQuantity: it.suppliedQuantity,
      isGift: it.isGift,
    }));
    const promoOff = claimed.promotionDiscount?.amountOff ?? 0;
    const newTotal = recomputeOrderTotal(asLines, promoOff);
    const deltaMinor = toMinorUnits(adjustmentDelta(claimed.total, newTotal));
    const revision = (claimed.adjustmentRevision ?? 0) + 1;

    await OrderModel.updateOne(
      { _id: claimed._id },
      {
        $set: {
          items: newItems,
          total: newTotal,
          adjusted: true,
          adjustedAt: now,
          adjustedByUserId: "system",
          adjustedByRole: "system",
          adjustmentRevision: revision,
        },
      }
    ).exec();

    if (deltaMinor > 0) {
      try {
        await postLedgerEntry({
          userId: String(claimed.userId),
          type: "refund",
          amountMinor: deltaMinor,
          description: `Stock shortage on order #${orderId.slice(-8).toUpperCase()} — credit`,
          orderId,
          idempotencyKey: `order_adjustment:${orderId}:rev${revision}`,
          actor: { userId: "system", role: "system" },
          onDuplicate: "ignore",
        });
      } catch {
        // A ledger outage must not undo a committed stock decrement; the credit
        // key lets it post later. Order total already reflects the shortage.
      }
    }

    // Reuse the existing order-updated event (owner + admin) — no new channel.
    publishRealtimeEvent({
      type: "order.status_changed",
      orderId,
      userId: String(claimed.userId),
      status: claimed.status,
      previousStatus: claimed.status,
    });
  }

  return { committed: true, oversold: shortages.length > 0 };
}

/** Returns committed units to stock exactly once (idempotent via stockReturnedAt). */
export async function returnOrderStock(orderId: string): Promise<{ returned: boolean }> {
  if (!isValidObjectId(orderId)) return { returned: false };
  await connectDB();
  const claimed = (await OrderModel.findOneAndUpdate(
    { _id: new mongoose.Types.ObjectId(orderId), stockCommittedAt: { $exists: true }, stockReturnedAt: { $exists: false } },
    { $set: { stockReturnedAt: new Date() } },
    { new: false }
  )
    .lean()
    .exec()) as CommitOrderLean | null;
  if (!claimed) return { returned: false }; // never committed, or already returned → no-op

  for (const it of claimed.items ?? []) {
    if (!it.productId) continue;
    const qty = suppliedQty({ quantity: it.quantity, suppliedQuantity: it.suppliedQuantity });
    if (!Number.isFinite(qty) || qty <= 0) continue;
    await ProductModel.updateOne({ _id: it.productId, stock: { $ne: null } }, { $inc: { stock: qty } }).exec();
  }
  return { returned: true };
}

/**
 * Applies a CONFIRMED card payment identified by its provider intent id. Called
 * ONLY from the verified-webhook path — never a client callback. Idempotent
 * (already-paid → no-op) and tolerant of replays/out-of-order deliveries. The
 * amount is compared against the order's STORED total, never trusted from input.
 * On success: paymentStatus→paid, an immediate `payment` ledger entry (nets the
 * order_charge), and the one-time stock commitment (with oversell handling).
 */
export async function markOrderPaidByIntent(
  intentId: string,
  eventAmountMinor: number
): Promise<{ ok: boolean; code?: string }> {
  if (!intentId) return { ok: false, code: "ORDER_NOT_FOUND" };
  await connectDB();
  const order = (await OrderModel.findOne({ paymentIntentId: intentId }).lean().exec()) as
    | { _id: mongoose.Types.ObjectId; userId: mongoose.Types.ObjectId; total: number; status: string; paymentStatus?: string }
    | null;
  if (!order) return { ok: false, code: "ORDER_NOT_FOUND" };

  const orderId = String(order._id);
  const expectedMinor = toMinorUnits(order.total);
  // Never trust the amount from the event — it must equal the stored order total.
  if (eventAmountMinor !== expectedMinor) return { ok: false, code: "AMOUNT_MISMATCH" };
  if (order.paymentStatus === "paid") return { ok: true, code: "ALREADY_PAID" }; // idempotent

  await OrderModel.updateOne(
    { _id: order._id, paymentStatus: { $ne: "paid" } },
    { $set: { paymentStatus: "paid", paidAt: new Date() } }
  ).exec();

  let ledgerEntryId = "";
  try {
    const posted = await postLedgerEntry({
      userId: String(order.userId),
      type: "payment",
      amountMinor: expectedMinor,
      description: `Card payment #${orderId.slice(-8).toUpperCase()}`,
      orderId,
      idempotencyKey: `payment:card:${orderId}`,
      actor: { userId: "system", role: "system" },
      onDuplicate: "ignore",
    });
    ledgerEntryId = posted.entryId;
  } catch {
    // Ledger outage must not fail the webhook; the key lets it post on retry.
  }

  // Card commits stock on confirmed payment (idempotent, oversell-aware).
  await commitOrderStock(orderId);

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
  return { ok: true };
}

/** Marks a card order failed by intent (from the webhook). Idempotent. */
export async function markOrderPaymentFailedByIntent(intentId: string): Promise<{ ok: boolean }> {
  if (!intentId) return { ok: false };
  await connectDB();
  await OrderModel.updateOne(
    { paymentIntentId: intentId, paymentStatus: { $nin: ["paid", "failed"] } },
    { $set: { paymentStatus: "failed" } }
  ).exec();
  return { ok: true };
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
        adjusted: (r as { adjusted?: boolean }).adjusted,
        adjustedAt: (r as { adjustedAt?: Date }).adjustedAt,
        adjustmentSeenAt: (r as { adjustmentSeenAt?: Date }).adjustmentSeenAt,
      })
    )
  );
}

export const RECEIPT_NOT_AVAILABLE_MESSAGE = "Receipt not available.";

export type OrderReceiptData = {
  order: OrderDetail;
  customer: { businessName: string; phoneNumber: string } | null;
};

/**
 * Receipt access rule (Work Order Issue 1): the CURRENT status is read from
 * the DB at request time and must pass isReceiptAvailable — pre-dispatch and
 * cancelled orders throw RECEIPT_NOT_AVAILABLE_MESSAGE (403 in the route).
 * Ownership: customers only reach their own orders; a wrong owner gets the
 * same "Order not found." as a missing id (no existence leak). Admins keep
 * access to any order's receipt (assumed policy, stated in the docs).
 */
export async function getOrderReceipt(
  requesterId: string,
  requesterRole: "customer" | "admin" | "agent",
  orderId: string
): Promise<OrderReceiptData> {
  if (!isValidObjectId(orderId)) {
    throw new Error("Order not found.");
  }
  await connectDB();

  const filter =
    requesterRole === "admin"
      ? { _id: new mongoose.Types.ObjectId(orderId) }
      : { _id: new mongoose.Types.ObjectId(orderId), userId: toUserObjectId(requesterId) };
  const doc = await OrderModel.findOne(filter).lean().exec();
  if (!doc) {
    throw new Error("Order not found.");
  }

  if (!isReceiptAvailable(doc.status)) {
    throw new Error(RECEIPT_NOT_AVAILABLE_MESSAGE);
  }

  const buyer = (await UserModel.findById(doc.userId, { businessName: 1, phoneNumber: 1 })
    .lean()
    .exec()) as { businessName?: string; phoneNumber?: string } | null;

  return {
    order: serializeOrder({
      _id: doc._id as mongoose.Types.ObjectId,
      userId: doc.userId as mongoose.Types.ObjectId,
      items: (doc.items ?? []) as OrderItemRow[],
      total: doc.total,
      status: doc.status,
      createdAt: doc.createdAt as Date,
      notes: (doc as { notes?: string }).notes,
      appliedPromotionIds: (doc as { appliedPromotionIds?: string[] }).appliedPromotionIds,
      promotionDiscount: (doc as { promotionDiscount?: OrderDetail["promotionDiscount"] }).promotionDiscount,
    }),
    customer: buyer
      ? { businessName: buyer.businessName ?? "", phoneNumber: buyer.phoneNumber ?? "" }
      : null,
  };
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
    adjusted: (doc as { adjusted?: boolean }).adjusted,
    adjustedAt: (doc as { adjustedAt?: Date }).adjustedAt,
    adjustmentSeenAt: (doc as { adjustmentSeenAt?: Date }).adjustmentSeenAt,
    paymentMethod: (doc as { paymentMethod?: "card" | "agent" }).paymentMethod,
    paymentStatus: (doc as { paymentStatus?: OrderDetail["paymentStatus"] }).paymentStatus,
    paidAt: (doc as { paidAt?: Date }).paidAt,
  });
}

/**
 * Marks a customer's adjusted order as acknowledged (clears the "unseen"
 * marker). Only the owner can acknowledge; no-op if already seen or not
 * adjusted. Fail-soft — never throws for the fire-and-forget UI call.
 */
export async function acknowledgeAdjustment(userId: string, orderId: string): Promise<void> {
  if (!isValidObjectId(userId) || !isValidObjectId(orderId)) return;
  await connectDB();
  await OrderModel.updateOne(
    {
      _id: new mongoose.Types.ObjectId(orderId),
      userId: toUserObjectId(userId),
      adjusted: true,
      adjustmentSeenAt: { $exists: false },
    },
    { $set: { adjustmentSeenAt: new Date() } }
  ).exec();
}
