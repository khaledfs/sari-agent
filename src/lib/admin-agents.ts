import bcrypt from "bcryptjs";
import mongoose, { isValidObjectId } from "mongoose";

import { assertAdminOnly, resolveActorScope } from "@/lib/actor-scope";
import { connectDB } from "@/lib/db";
import { CollectionTaskModel } from "@/models/collection-task.model";
import { MessageThreadModel } from "@/models/message.model";
import { OrderModel } from "@/models/order.model";
import { UserModel } from "@/models/user.model";
import { isStrongPassword } from "@/lib/validators";
import { CANCELLED_STATUS_RX } from "@/services/admin-overview.service";

/**
 * Agent management (Work Order 2, Task D) — ADMIN-ONLY. Agents are users with
 * role "agent"; customers point at them via assignedAgentId. Reassignment
 * never rewrites history (orders/ledger/messages keep their original actors);
 * handover means FUTURE orders and messages route to the new agent.
 */

export type AdminAgentRow = {
  id: string;
  businessName: string;
  email: string;
  phoneNumber: string;
  routeLabel: string;
  customerCount: number;
  /** Orders + revenue over the last 30 days across their customers. */
  orders30d: number;
  revenue30d: number;
  /** Latest order or message activity among their customers (ISO or null). */
  lastActivityAt: string | null;
  createdAt: string;
  /** Soft-removal state — true = fired (no login, no scope), history kept. */
  removed: boolean;
  /** When the agent was removed (ISO), or null if active. */
  removedAt: string | null;
};

export type RemoveAgentResult = {
  removedAgentId: string;
  /** Agent the customers/tasks moved to, or null when they were unassigned. */
  reassignedTo: string | null;
  customersReassigned: number;
  openTasksReassigned: number;
};

export async function listAdminAgents(): Promise<AdminAgentRow[]> {
  const scope = await resolveActorScope();
  assertAdminOnly(scope);
  await connectDB();

  const agents = (await UserModel.find({ role: "agent" }, { password: 0 })
    .sort({ createdAt: -1 })
    .lean()
    .exec()) as Array<{
    _id: mongoose.Types.ObjectId;
    businessName: string;
    email: string;
    phoneNumber: string;
    routeLabel?: string;
    createdAt?: Date;
    agentStatus?: string;
    removedAt?: Date;
  }>;
  if (!agents.length) return [];

  const agentIds = agents.map((a) => a._id);
  const d30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const customers = (await UserModel.find({ role: "customer", assignedAgentId: { $in: agentIds } })
    .select("_id assignedAgentId")
    .lean()
    .exec()) as Array<{ _id: mongoose.Types.ObjectId; assignedAgentId: mongoose.Types.ObjectId }>;
  const customersByAgent = new Map<string, mongoose.Types.ObjectId[]>();
  for (const c of customers) {
    const key = String(c.assignedAgentId);
    (customersByAgent.get(key) ?? customersByAgent.set(key, []).get(key)!).push(c._id);
  }

  const allCustomerIds = customers.map((c) => c._id);
  const orderRows = allCustomerIds.length
    ? await OrderModel.aggregate<{ _id: mongoose.Types.ObjectId; orders: number; revenue: number; last: Date }>([
        { $match: { userId: { $in: allCustomerIds }, status: { $not: CANCELLED_STATUS_RX } } },
        {
          $group: {
            _id: "$userId",
            orders: { $sum: { $cond: [{ $gte: ["$createdAt", d30] }, 1, 0] } },
            revenue: { $sum: { $cond: [{ $gte: ["$createdAt", d30] }, "$total", 0] } },
            last: { $max: "$createdAt" },
          },
        },
      ]).exec()
    : [];
  const orderStatsByCustomer = new Map(orderRows.map((r) => [String(r._id), r]));

  const threads = (await MessageThreadModel.find({ agentId: { $in: agentIds } })
    .select("agentId lastMessageAt")
    .lean()
    .exec()) as Array<{ agentId: mongoose.Types.ObjectId; lastMessageAt: Date }>;
  const lastMessageByAgent = new Map<string, Date>();
  for (const t of threads) {
    const key = String(t.agentId);
    const prev = lastMessageByAgent.get(key);
    if (!prev || t.lastMessageAt > prev) lastMessageByAgent.set(key, t.lastMessageAt);
  }

  return agents.map((agent) => {
    const key = String(agent._id);
    const myCustomers = customersByAgent.get(key) ?? [];
    let orders30d = 0;
    let revenue30d = 0;
    let lastOrder: Date | null = null;
    for (const cid of myCustomers) {
      const stats = orderStatsByCustomer.get(String(cid));
      if (!stats) continue;
      orders30d += stats.orders;
      revenue30d += stats.revenue;
      if (!lastOrder || stats.last > lastOrder) lastOrder = stats.last;
    }
    const lastMessage = lastMessageByAgent.get(key) ?? null;
    const lastActivity =
      lastOrder && lastMessage ? (lastOrder > lastMessage ? lastOrder : lastMessage) : lastOrder ?? lastMessage;
    return {
      id: key,
      businessName: agent.businessName,
      email: agent.email,
      phoneNumber: agent.phoneNumber,
      routeLabel: agent.routeLabel ?? "",
      customerCount: myCustomers.length,
      orders30d,
      revenue30d: Math.round(revenue30d * 100) / 100,
      lastActivityAt: lastActivity ? lastActivity.toISOString() : null,
      createdAt: agent.createdAt instanceof Date ? agent.createdAt.toISOString() : "",
      removed: agent.agentStatus === "removed",
      removedAt: agent.removedAt instanceof Date ? agent.removedAt.toISOString() : null,
    };
  });
}

/**
 * Validates a reassignment target's SHAPE (pure — no DB). Returns the target
 * agent id, or null when the choice is "unassign" (empty/null). Throws with a
 * stable message for an invalid id or an attempt to hand customers to the very
 * agent being removed. DB existence/active checks happen in removeAdminAgent.
 */
export function assertReassignTargetShape(
  agentId: string,
  rawTarget: string | null | undefined,
): string | null {
  const target = rawTarget == null ? "" : String(rawTarget).trim();
  if (target === "") return null; // unassign
  if (!isValidObjectId(target)) {
    throw new Error("Reassignment target not found.");
  }
  if (target === String(agentId)) {
    throw new Error("Cannot reassign customers to the agent being removed.");
  }
  return target;
}

export async function createAdminAgent(input: Record<string, unknown>): Promise<AdminAgentRow> {
  const scope = await resolveActorScope();
  assertAdminOnly(scope);

  const businessName = String(input.businessName ?? "").trim();
  const email = String(input.email ?? "").trim().toLowerCase();
  const phoneNumber = String(input.phoneNumber ?? "").trim();
  const password = String(input.password ?? "");
  const routeLabel = String(input.routeLabel ?? "").trim().slice(0, 120);
  if (!businessName) throw new Error("Agent name is required.");
  if (!email.includes("@")) throw new Error("Valid email is required.");
  if (!phoneNumber) throw new Error("Phone number is required.");
  if (!isStrongPassword(password)) {
    throw new Error("Password must be at least 8 characters and include uppercase, lowercase, and number.");
  }

  await connectDB();
  const created = await UserModel.create({
    businessName,
    email,
    phoneNumber,
    password: await bcrypt.hash(password, 10),
    role: "agent",
    isVerified: true,
    ...(routeLabel ? { routeLabel } : {}),
  });

  return {
    id: String(created._id),
    businessName,
    email,
    phoneNumber,
    routeLabel,
    customerCount: 0,
    orders30d: 0,
    revenue30d: 0,
    lastActivityAt: null,
    createdAt: new Date().toISOString(),
    removed: false,
    removedAt: null,
  };
}

/**
 * Removes (soft-fires) an agent — ADMIN-ONLY. Never a hard delete: the agent
 * document and all history stay intact. In one call it (1) reassigns the
 * agent's customers to another ACTIVE agent, or unassigns them (assignedAgentId
 * = null); (2) hands the agent's OPEN collection tasks to the same target, or
 * surfaces them to the admin (agentId = null — never dropped); (3) flips the
 * agent to agentStatus "removed" so login is refused and the per-request scope
 * resolver denies its session on the next request. Idempotent-safe: re-removing
 * an already-removed agent just re-applies the (now empty) reassignment.
 */
export async function removeAdminAgent(
  agentId: string,
  input: { reassignToAgentId?: string | null },
): Promise<RemoveAgentResult> {
  const scope = await resolveActorScope();
  assertAdminOnly(scope);
  await connectDB();

  if (!isValidObjectId(agentId)) throw new Error("Agent not found.");
  const agent = (await UserModel.findById(agentId).select("role").lean().exec()) as {
    role?: string;
  } | null;
  if (!agent || agent.role !== "agent") throw new Error("Agent not found.");

  // Reassignment target: pure shape check first, then DB existence/active check.
  const targetId = assertReassignTargetShape(agentId, input.reassignToAgentId);
  let reassignTo: mongoose.Types.ObjectId | null = null;
  if (targetId) {
    const target = (await UserModel.findById(targetId).select("role agentStatus").lean().exec()) as {
      role?: string;
      agentStatus?: string;
    } | null;
    if (!target || target.role !== "agent") throw new Error("Reassignment target not found.");
    if (target.agentStatus === "removed") throw new Error("Reassignment target is not active.");
    reassignTo = new mongoose.Types.ObjectId(targetId);
  }

  const agentObjId = new mongoose.Types.ObjectId(agentId);

  // 1) Move (or unassign) the removed agent's customers.
  const customersRes = await UserModel.updateMany(
    { role: "customer", assignedAgentId: agentObjId },
    { $set: { assignedAgentId: reassignTo } },
  ).exec();

  // 2) Move (or surface to admin) the removed agent's OPEN collection tasks.
  //    Collected/cancelled tasks are history and are left untouched.
  const tasksRes = await CollectionTaskModel.updateMany(
    { agentId: agentObjId, status: "open" },
    { $set: { agentId: reassignTo } },
  ).exec();

  // 3) Soft-retire the agent (session dies on its next request; login refused).
  await UserModel.updateOne(
    { _id: agentObjId },
    { $set: { agentStatus: "removed", removedAt: new Date(), removedByUserId: scope.userId } },
  ).exec();

  return {
    removedAgentId: String(agentId),
    reassignedTo: reassignTo ? String(reassignTo) : null,
    customersReassigned: customersRes.modifiedCount ?? 0,
    openTasksReassigned: tasksRes.modifiedCount ?? 0,
  };
}

/** Lightweight identity for the console header ("who am I, how many customers"). */
export async function getConsoleIdentity(): Promise<{
  role: "admin" | "agent";
  businessName: string;
  routeLabel: string;
  customerCount: number | null;
}> {
  const scope = await resolveActorScope();
  await connectDB();
  const me = (await UserModel.findById(scope.userId).select("businessName routeLabel").lean().exec()) as {
    businessName?: string;
    routeLabel?: string;
  } | null;
  return {
    role: scope.role,
    businessName: me?.businessName ?? "",
    routeLabel: me?.routeLabel ?? "",
    customerCount: scope.role === "agent" ? scope.customerIds.length : null,
  };
}
