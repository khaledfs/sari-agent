import mongoose, { isValidObjectId } from "mongoose";

import { assertCanActOnCustomer, scopedCustomerObjectIds, type ActorScope } from "@/lib/actor-scope";
import { connectDB } from "@/lib/db";
import { CollectionTaskModel } from "@/models/collection-task.model";
import { OrderModel } from "@/models/order.model";
import { UserModel } from "@/models/user.model";
import { isOrderCollectible } from "@/lib/order-status";
import { CANCELLED_STATUS_RX } from "@/services/admin-overview.service";
import { publishRealtimeEvent } from "@/services/event-bus.service";
import { postLedgerEntry } from "@/services/ledger.service";

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
  amountMinor: number;
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
  customerNameById: Map<string, string>
): CollectionViewRow[] {
  const taskByOrder = new Map(tasks.map((t) => [t.orderId, t]));
  const rows: CollectionViewRow[] = [];
  for (const o of orders) {
    const task = taskByOrder.get(o.orderId);
    if (task && task.status !== "open") continue; // collected/cancelled → no longer owed
    // State is decided by the ORDER STATUS, not by whether a task row exists yet.
    const collectible = isOrderCollectible(o.status);
    rows.push({
      taskId: task ? task.taskId : null,
      orderId: o.orderId,
      orderNumber: o.orderId.slice(-8).toUpperCase(),
      customerId: o.customerId,
      customerName: customerNameById.get(o.customerId) ?? "",
      // The task snapshot when present (what "collect" posts); else the live total.
      amountMinor: task ? task.amountMinor : Math.round(Number(Number(o.total).toFixed(2)) * 100),
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
  return buildCollectionViewRows(viewOrders, viewTasks, nameById);
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

/**
 * Marks a task collected → posts the ledger `payment` (agent/admin as actor)
 * through the shared path. Cross-scope task → "…not found." (404). Idempotent:
 * collecting twice posts one payment (order-id idempotency key) and won't flip
 * an already-collected task again.
 */
export async function markCollectionCollected(
  scope: ActorScope,
  taskId: string,
  note?: string
): Promise<{ ok: boolean }> {
  if (!isValidObjectId(taskId)) throw new Error("Collection task not found.");
  await connectDB();
  const task = (await CollectionTaskModel.findById(taskId).lean().exec()) as
    | {
        _id: mongoose.Types.ObjectId;
        orderId: mongoose.Types.ObjectId;
        customerId: mongoose.Types.ObjectId;
        amountMinor: number;
        status: string;
      }
    | null;
  if (!task) throw new Error("Collection task not found.");

  // Scope: an agent may only collect for their own customers; cross-scope 404.
  try {
    assertCanActOnCustomer(scope, String(task.customerId));
  } catch {
    throw new Error("Collection task not found.");
  }

  if (task.status === "collected") return { ok: true }; // idempotent
  if (task.status !== "open") throw new Error("Collection task is not open.");

  // Reuse the ONE ledger writer — amount from the task (server), never client.
  const posted = await postLedgerEntry({
    userId: String(task.customerId),
    type: "payment",
    amountMinor: task.amountMinor,
    description: `Agent collection #${String(task.orderId).slice(-8).toUpperCase()}`,
    orderId: String(task.orderId),
    idempotencyKey: `collection:${String(task.orderId)}`,
    actor: { userId: scope.userId, role: scope.role },
    onDuplicate: "ignore",
  });

  await CollectionTaskModel.updateOne(
    { _id: task._id, status: "open" },
    {
      $set: {
        status: "collected",
        collectedAt: new Date(),
        collectedByUserId: scope.userId,
        ...(note ? { note: String(note).slice(0, 500) } : {}),
      },
    }
  ).exec();

  publishRealtimeEvent({ type: "ledger.entry_created", userId: String(task.customerId), entryId: posted.entryId });
  return { ok: true };
}
