import mongoose, { isValidObjectId } from "mongoose";

import { assertCanActOnCustomer, scopedCustomerObjectIds, type ActorScope } from "@/lib/actor-scope";
import { connectDB } from "@/lib/db";
import { CollectionTaskModel } from "@/models/collection-task.model";
import { OrderModel } from "@/models/order.model";
import { UserModel } from "@/models/user.model";
import { isOrderCollectible } from "@/lib/order-status";
import { CANCELLED_STATUS_RX } from "@/services/admin-overview.service";
import { publishRealtimeEvent } from "@/services/event-bus.service";
import {
  countOrderPayments,
  postLedgerEntry,
  sumOrderPayments,
  sumPaymentsByOrder,
} from "@/services/ledger.service";

/**
 * Agent cash/cheque collection tasks (payment feature).
 *
 * Created when an "agent"-paid order is APPROVED (confirmed) — never for a
 * pending order. The assigned agent (or the admin, if none) collects in person
 * and marks it collected, which posts the ONE ledger payment for that order
 * through the shared postLedgerEntry path (idempotency key = the order id, so a
 * double "collect" never double-pays). The amount is copied from the order —
 * never from the client. Ownership is the existing scope resolver.
 */

export type CollectionTaskView = {
  taskId: string;
  orderId: string;
  orderNumber: string;
  customerId: string;
  customerName: string;
  amountMinor: number;
  status: string;
  /** Delivery status of the underlying order (for the agent's context). */
  orderStatus: string;
  createdAt: string;
};

type OrderForTask = {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  total: number;
  status: string;
};

function toMinorUnitsInt(total: number): number {
  return Math.round(Number(Number(total).toFixed(2)) * 100);
}

/**
 * Idempotently creates the collection task for a confirmed agent order. The
 * assigned agent is read server-side; none → agentId null (admin-owned, never
 * dropped). One task per order (unique orderId, upsert-on-insert).
 */
export async function createCollectionTaskForOrder(order: OrderForTask): Promise<void> {
  await connectDB();
  const customer = (await UserModel.findById(order.userId, { assignedAgentId: 1 }).lean().exec()) as
    | { assignedAgentId?: mongoose.Types.ObjectId | null }
    | null;
  const agentId = customer?.assignedAgentId ?? null;

  const res = await CollectionTaskModel.updateOne(
    { orderId: order._id },
    {
      $setOnInsert: {
        orderId: order._id,
        customerId: order.userId,
        agentId,
        amountMinor: toMinorUnitsInt(order.total),
        status: "open",
      },
    },
    { upsert: true }
  ).exec();

  // Only ping the UI when a task was ACTUALLY created — the trigger now fires on
  // every collectible transition (confirmed…delivered), so later transitions
  // hit the existing task and must not spam redundant refresh events.
  if ((res.upsertedCount ?? 0) > 0) {
    publishRealtimeEvent({
      type: "order.status_changed",
      orderId: String(order._id),
      userId: String(order.userId),
      status: order.status,
      previousStatus: order.status,
    });
  }
}

/**
 * Read-path safety net: bulk-idempotently ensures a task exists for every
 * collectible agent order that lacks one (seed/smoke direct-inserts, or an order
 * that jumped straight to a later status). Unique orderId → never a second task;
 * no realtime event (this runs inside a GET).
 */
async function ensureCollectionTasks(
  missing: Array<{ orderId: mongoose.Types.ObjectId; userId: mongoose.Types.ObjectId; total: number }>,
  agentByCustomer: Map<string, mongoose.Types.ObjectId | null>
): Promise<void> {
  if (missing.length === 0) return;
  await CollectionTaskModel.bulkWrite(
    missing.map((o) => ({
      updateOne: {
        filter: { orderId: o.orderId },
        update: {
          $setOnInsert: {
            orderId: o.orderId,
            customerId: o.userId,
            agentId: agentByCustomer.get(String(o.userId)) ?? null,
            amountMinor: toMinorUnitsInt(o.total),
            status: "open",
          },
        },
        upsert: true,
      },
    })),
    { ordered: false }
  );
}

/** Cancels the open task for a cancelled order (idempotent). */
export async function cancelCollectionTaskForOrder(orderId: string): Promise<void> {
  if (!isValidObjectId(orderId)) return;
  await connectDB();
  await CollectionTaskModel.updateOne(
    { orderId: new mongoose.Types.ObjectId(orderId), status: "open" },
    { $set: { status: "cancelled" } }
  ).exec();
}

/**
 * Open collections for the console actor: an agent sees ONLY their own
 * customers' tasks (scope resolver), an admin sees all open tasks (including
 * unassigned/admin-owned ones).
 */
export async function listOpenCollections(scope: ActorScope): Promise<CollectionTaskView[]> {
  await connectDB();
  const filter: Record<string, unknown> =
    scope.role === "admin"
      ? { status: "open" }
      : { status: "open", agentId: new mongoose.Types.ObjectId(scope.userId) };

  const tasks = (await CollectionTaskModel.find(filter).sort({ createdAt: -1 }).lean().exec()) as Array<{
    _id: mongoose.Types.ObjectId;
    orderId: mongoose.Types.ObjectId;
    customerId: mongoose.Types.ObjectId;
    amountMinor: number;
    status: string;
    createdAt?: Date;
  }>;
  if (tasks.length === 0) return [];

  const customerIds = [...new Set(tasks.map((t) => String(t.customerId)))];
  const orderIds = tasks.map((t) => t.orderId);
  const [customers, orders] = await Promise.all([
    UserModel.find({ _id: { $in: customerIds } }, { businessName: 1 }).lean().exec() as Promise<
      Array<{ _id: unknown; businessName?: string }>
    >,
    OrderModel.find({ _id: { $in: orderIds } }, { status: 1 }).lean().exec() as Promise<
      Array<{ _id: unknown; status?: string }>
    >,
  ]);
  const nameById = new Map(customers.map((c) => [String(c._id), c.businessName ?? ""]));
  const statusById = new Map(orders.map((o) => [String(o._id), o.status ?? ""]));

  return tasks.map((t) => ({
    taskId: String(t._id),
    orderId: String(t.orderId),
    orderNumber: String(t.orderId).slice(-8).toUpperCase(),
    customerId: String(t.customerId),
    customerName: nameById.get(String(t.customerId)) ?? "",
    amountMinor: t.amountMinor,
    status: t.status,
    orderStatus: statusById.get(String(t.orderId)) ?? "",
    createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : "",
  }));
}

/**
 * Agent-facing collections view: every agent-paid order that still owes an
 * in-person collection, from the ORDER (the source of truth). Two states,
 * derived from the ORDER STATUS (never from whether a task row happens to
 * exist yet):
 *   - "pending"     — order still "pending" (pre-approval) → not yet collectible;
 *   - "collectible" — order is approval-or-later (confirmed…delivered) → the
 *                     agent can collect (a task is ensured so the action works).
 * Orders whose task is already collected/cancelled are dropped. Oldest-first
 * (agents work the oldest outstanding first).
 */
export type CollectionViewRow = {
  taskId: string | null;
  orderId: string;
  orderNumber: string;
  customerId: string;
  customerName: string;
  /** OWED NOW (outstanding) for collectible rows; the live total for pending. */
  amountMinor: number;
  /** Already paid against this order (partial payments). */
  paidMinor: number;
  orderStatus: string;
  state: "collectible" | "pending";
  createdAt: string;
};

type ViewOrder = { orderId: string; total: number; status: string; customerId: string; createdAt: string };
type ViewTask = { orderId: string; taskId: string; amountMinor: number; status: string };

/** Pure row builder (unit-tested). `orders` must already be oldest-first. */
export function buildCollectionViewRows(
  orders: ViewOrder[],
  tasks: ViewTask[],
  customerNameById: Map<string, string>,
  paidByOrder: Map<string, number> = new Map()
): CollectionViewRow[] {
  const taskByOrder = new Map(tasks.map((t) => [t.orderId, t]));
  const rows: CollectionViewRow[] = [];
  for (const o of orders) {
    const task = taskByOrder.get(o.orderId);
    if (task && task.status !== "open") continue; // collected/cancelled → no longer owed
    // State is decided by the ORDER STATUS, not by whether a task row exists yet.
    const collectible = isOrderCollectible(o.status);
    const fullAmount = task ? task.amountMinor : Math.round(Number(Number(o.total).toFixed(2)) * 100);
    const paid = paidByOrder.get(o.orderId) ?? 0;
    const outstanding = collectionOutstanding(fullAmount, paid);
    // Fully paid via any path → settled → drop from the owed list.
    if (collectible && outstanding <= 0) continue;
    rows.push({
      taskId: task ? task.taskId : null,
      orderId: o.orderId,
      orderNumber: o.orderId.slice(-8).toUpperCase(),
      customerId: o.customerId,
      customerName: customerNameById.get(o.customerId) ?? "",
      // Collectible → what's STILL owed; pending → the live total.
      amountMinor: collectible ? outstanding : fullAmount,
      paidMinor: paid,
      orderStatus: o.status,
      state: collectible ? "collectible" : "pending",
      // ORDER's created date, so the UI's age is meaningful (NOT the task's
      // creation moment — a lazily-ensured task must not make an old order read 0d).
      createdAt: o.createdAt,
    });
  }
  return rows;
}

/** Scoped collections view — agent: own customers only; admin: everyone. */
export async function listCollectionsView(scope: ActorScope): Promise<CollectionViewRow[]> {
  await connectDB();
  const scopedIds = scopedCustomerObjectIds(scope);
  const scopeMatch: Record<string, unknown> = scopedIds ? { userId: { $in: scopedIds } } : {};
  if (scopedIds && scopedIds.length === 0) return []; // agent with no customers

  const orders = (await OrderModel.find(
    { ...scopeMatch, paymentMethod: "agent", status: { $not: CANCELLED_STATUS_RX } },
    { total: 1, status: 1, userId: 1, createdAt: 1 }
  )
    .sort({ createdAt: 1 })
    .limit(500)
    .lean()
    .exec()) as Array<{ _id: mongoose.Types.ObjectId; total: number; status: string; userId: mongoose.Types.ObjectId; createdAt?: Date }>;
  if (orders.length === 0) return [];

  const orderIds = orders.map((o) => o._id);
  const customerIds = [...new Set(orders.map((o) => String(o.userId)))];
  const loadTasks = () =>
    CollectionTaskModel.find({ orderId: { $in: orderIds } }, { orderId: 1, amountMinor: 1, status: 1 }).lean().exec() as Promise<
      Array<{ _id: mongoose.Types.ObjectId; orderId: mongoose.Types.ObjectId; amountMinor: number; status: string }>
    >;
  const [initialTasks, customers] = await Promise.all([
    loadTasks(),
    UserModel.find({ _id: { $in: customerIds } }, { businessName: 1, assignedAgentId: 1 }).lean().exec() as Promise<
      Array<{ _id: unknown; businessName?: string; assignedAgentId?: mongoose.Types.ObjectId | null }>
    >,
  ]);
  let tasks = initialTasks;

  // Self-heal: any collectible-status order without a task (seed/smoke direct
  // insert, or a status that bypassed the creation trigger) gets one now, so
  // the collect action is actually available. Idempotent; then re-read.
  const haveTask = new Set(tasks.map((t) => String(t.orderId)));
  const agentByCustomer = new Map<string, mongoose.Types.ObjectId | null>(
    customers.map((c) => [String(c._id), c.assignedAgentId ?? null])
  );
  const missing = orders.filter((o) => isOrderCollectible(o.status ?? "") && !haveTask.has(String(o._id)));
  if (missing.length > 0) {
    await ensureCollectionTasks(
      missing.map((o) => ({ orderId: o._id, userId: o.userId, total: o.total })),
      agentByCustomer
    );
    tasks = await loadTasks();
  }

  const viewOrders: ViewOrder[] = orders.map((o) => ({
    orderId: String(o._id),
    total: o.total,
    status: o.status ?? "",
    customerId: String(o.userId),
    createdAt: o.createdAt instanceof Date ? o.createdAt.toISOString() : "",
  }));
  const viewTasks: ViewTask[] = tasks.map((t) => ({
    orderId: String(t.orderId),
    taskId: String(t._id),
    amountMinor: t.amountMinor,
    status: t.status,
  }));
  const nameById = new Map(customers.map((c) => [String(c._id), c.businessName ?? ""]));
  // Derived outstanding: Σ payments per order (one aggregation, no N+1).
  const paidByOrder = await sumPaymentsByOrder(orderIds.map((id) => String(id)));
  return buildCollectionViewRows(viewOrders, viewTasks, nameById, paidByOrder);
}

/** Count of OPEN (collectible) tasks in the actor's scope — for the nav badge. */
export async function countOpenCollections(scope: ActorScope): Promise<number> {
  await connectDB();
  const filter =
    scope.role === "admin"
      ? { status: "open" }
      : { status: "open", agentId: new mongoose.Types.ObjectId(scope.userId) };
  return CollectionTaskModel.countDocuments(filter).exec();
}

// ---------------------------------------------------------------------------
// Unified collection settlement (single money path — see DEV_NOTES).
// ---------------------------------------------------------------------------

export const COLLECTION_OVERPAY_MESSAGE = "Payment exceeds the outstanding amount.";
export const COLLECTION_CHEQUE_MESSAGE = "Cheque number and date are required.";
export const COLLECTION_PAYMENT_INVALID_CODE = "COLLECTION_PAYMENT_INVALID";

/** Remaining owed on a collection (pure, unit-tested). Never negative. */
export function collectionOutstanding(amountMinor: number, paidMinor: number): number {
  return Math.max(0, Math.round(amountMinor) - Math.round(paidMinor));
}

/** Amount validity for a collection payment (pure, unit-tested). Overpay disallowed. */
export function validateCollectionPaymentAmount(amountMinor: number, outstandingMinor: number): void {
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    throw new Error("Amount must be a positive whole number of agorot.");
  }
  if (amountMinor > outstandingMinor) {
    throw new Error(COLLECTION_OVERPAY_MESSAGE);
  }
}

export type CollectionPaymentInput = {
  /** agorot; defaults to the full outstanding (a partial payment ≤ outstanding is allowed). */
  amountMinor?: number;
  method?: "cash" | "cheque";
  chequeNumber?: string;
  chequeDate?: string; // ISO
  chequeBank?: string;
  note?: string;
};

export type CollectionPaymentResult = {
  ok: boolean;
  paidMinor: number;
  outstandingMinor: number;
  settled: boolean;
  duplicate?: boolean;
};

async function settleTask(
  taskId: mongoose.Types.ObjectId,
  scope: ActorScope,
  note?: string
): Promise<void> {
  await CollectionTaskModel.updateOne(
    { _id: taskId, status: "open" },
    {
      $set: {
        status: "collected",
        collectedAt: new Date(),
        collectedByUserId: scope.userId,
        ...(note ? { note: String(note).slice(0, 500) } : {}),
      },
    }
  ).exec();
}

/**
 * THE single money path for settling a collection. A payment is recorded ONCE,
 * anchored to the order; the outstanding is DERIVED from posted payments against
 * the order (`amount − Σ payments`), so the ledger and the collections view can
 * never disagree or double-count:
 * - overpay is rejected (amount ≤ outstanding), so once the debt is paid via
 *   EITHER path (collect button or a ledger payment for the order) a second full
 *   payment is impossible;
 * - the idempotency key `collection:<orderId>:p<seq>` is serialized by the unique
 *   ledger index, so concurrent double-submits collapse to one payment.
 * Partial payments leave the task open at the reduced outstanding.
 */
export async function recordCollectionPayment(
  scope: ActorScope,
  taskId: string,
  input: CollectionPaymentInput = {}
): Promise<CollectionPaymentResult> {
  if (!isValidObjectId(taskId)) throw new Error("Collection task not found.");
  await connectDB();
  const task = (await CollectionTaskModel.findById(taskId).lean().exec()) as
    | { _id: mongoose.Types.ObjectId; orderId: mongoose.Types.ObjectId; customerId: mongoose.Types.ObjectId; amountMinor: number; status: string }
    | null;
  if (!task) throw new Error("Collection task not found.");
  try {
    assertCanActOnCustomer(scope, String(task.customerId));
  } catch {
    throw new Error("Collection task not found."); // no existence leak
  }
  if (task.status === "cancelled") throw new Error("Collection task is not open.");

  const orderId = String(task.orderId);
  const paid = await sumOrderPayments(orderId);
  const outstanding = collectionOutstanding(task.amountMinor, paid);

  // Already fully settled (paid via the other path) → idempotent no-op; never a
  // second payment. Ensure the task status reflects the derived truth.
  if (outstanding <= 0) {
    if (task.status !== "collected") await settleTask(task._id, scope, input.note);
    return { ok: true, paidMinor: 0, outstandingMinor: 0, settled: true };
  }

  const amount = Number.isFinite(input.amountMinor as number) ? Math.trunc(Number(input.amountMinor)) : outstanding;
  validateCollectionPaymentAmount(amount, outstanding);

  const method: "cash" | "cheque" = input.method === "cheque" ? "cheque" : "cash";
  let cheque: { number?: string; date?: Date; bank?: string } | undefined;
  if (method === "cheque") {
    const number = (input.chequeNumber ?? "").trim();
    const date = input.chequeDate ? new Date(input.chequeDate) : null;
    if (!number || !date || Number.isNaN(date.getTime())) throw new Error(COLLECTION_CHEQUE_MESSAGE);
    cheque = {
      number: number.slice(0, 60),
      date,
      ...(input.chequeBank?.trim() ? { bank: input.chequeBank.trim().slice(0, 120) } : {}),
    };
  }

  const seq = await countOrderPayments(orderId);
  const posted = await postLedgerEntry({
    userId: String(task.customerId),
    type: "payment",
    amountMinor: amount,
    description: `Agent collection #${orderId.slice(-8).toUpperCase()}${method === "cheque" ? ` — cheque ${cheque!.number}` : ""}`,
    orderId,
    paymentMethod: method,
    ...(cheque ? { cheque } : {}),
    idempotencyKey: `collection:${orderId}:p${seq}`,
    actor: { userId: scope.userId, role: scope.role },
    onDuplicate: "ignore",
  });

  // A concurrent submit already claimed this slot → no new money was posted.
  if (!posted.created) {
    const p = await sumOrderPayments(orderId);
    const o = collectionOutstanding(task.amountMinor, p);
    if (o <= 0 && task.status !== "collected") await settleTask(task._id, scope, input.note);
    return { ok: true, paidMinor: 0, outstandingMinor: o, settled: o <= 0, duplicate: true };
  }

  const newOutstanding = collectionOutstanding(task.amountMinor, paid + amount);
  if (newOutstanding <= 0) {
    await settleTask(task._id, scope, input.note);
  } else if (input.note) {
    await CollectionTaskModel.updateOne({ _id: task._id }, { $set: { note: String(input.note).slice(0, 500) } }).exec();
  }

  // Both the collections view and the ledger view refetch on ledger.entry_created.
  publishRealtimeEvent({ type: "ledger.entry_created", userId: String(task.customerId), entryId: posted.entryId });
  return { ok: true, paidMinor: amount, outstandingMinor: newOutstanding, settled: newOutstanding <= 0 };
}

/**
 * Backward-compatible "mark collected": a full cash payment for the remaining
 * outstanding through the unified path (idempotent, never double-posts).
 */
export async function markCollectionCollected(
  scope: ActorScope,
  taskId: string,
  note?: string
): Promise<{ ok: boolean }> {
  const r = await recordCollectionPayment(scope, taskId, { method: "cash", note });
  return { ok: r.ok };
}

/**
 * Open collections for one customer with their live outstanding — powers the
 * admin ledger form's "which order does this payment settle" selector and the
 * guard that forbids an unlinked payment while collections are open.
 */
export async function getOpenCollectionsForCustomer(
  customerId: string
): Promise<Array<{ taskId: string; orderId: string; orderNumber: string; outstandingMinor: number }>> {
  if (!isValidObjectId(customerId)) return [];
  await connectDB();
  const tasks = (await CollectionTaskModel.find(
    { customerId: new mongoose.Types.ObjectId(customerId), status: "open" },
    { orderId: 1, amountMinor: 1 }
  )
    .sort({ createdAt: 1 })
    .lean()
    .exec()) as Array<{ _id: mongoose.Types.ObjectId; orderId: mongoose.Types.ObjectId; amountMinor: number }>;
  if (tasks.length === 0) return [];
  const paidByOrder = await sumPaymentsByOrder(tasks.map((t) => String(t.orderId)));
  return tasks
    .map((t) => {
      const orderId = String(t.orderId);
      return {
        taskId: String(t._id),
        orderId,
        orderNumber: orderId.slice(-8).toUpperCase(),
        outstandingMinor: collectionOutstanding(t.amountMinor, paidByOrder.get(orderId) ?? 0),
      };
    })
    .filter((c) => c.outstandingMinor > 0);
}

/** Finds the open collection task for an order (used by the ledger payment path). */
export async function findOpenTaskIdForOrder(orderId: string): Promise<string | null> {
  if (!isValidObjectId(orderId)) return null;
  await connectDB();
  const task = await CollectionTaskModel.findOne(
    { orderId: new mongoose.Types.ObjectId(orderId), status: "open" },
    { _id: 1 }
  )
    .lean()
    .exec();
  return task ? String(task._id) : null;
}
