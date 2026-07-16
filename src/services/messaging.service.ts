import mongoose, { isValidObjectId } from "mongoose";

import { assertCanActOnCustomer, type ActorScope } from "@/lib/actor-scope";
import { connectDB } from "@/lib/db";
import { MESSAGE_MAX_LENGTH, MessageModel, MessageThreadModel } from "@/models/message.model";
import { UserModel } from "@/models/user.model";
import { publishRealtimeEvent } from "@/services/event-bus.service";

/**
 * Customer ↔ agent messaging (Work Order 2, Task D).
 *
 * Ownership is enforced through the SAME scope resolver as every console
 * surface: a customer only ever reaches the thread of their own assigned
 * agent; an agent only reaches threads of their own customers; the admin
 * reads everything (and may send — recorded honestly as admin).
 * RESTRICTED customers may message (messaging is not ordering — it's how a
 * payment hold gets resolved); nothing here calls requireOrderingEnabled.
 */

export type MessageView = {
  id: string;
  senderRole: "customer" | "agent" | "admin";
  /** True when the CALLER wrote this message (render side). */
  mine: boolean;
  body: string;
  createdAt: string;
  readAt: string | null;
};

export type ThreadView = {
  threadId: string;
  customerId: string;
  agentId: string;
  agentName: string;
  customerName: string;
  lastMessageAt: string;
  unreadCount: number;
};

const PAGE_SIZE = 50;

type ThreadLean = {
  _id: mongoose.Types.ObjectId;
  customerId: mongoose.Types.ObjectId;
  agentId: mongoose.Types.ObjectId;
  lastMessageAt: Date;
};

type MessageLean = {
  _id: mongoose.Types.ObjectId;
  threadId: mongoose.Types.ObjectId;
  senderUserId: mongoose.Types.ObjectId;
  senderRole: "customer" | "agent" | "admin";
  body: string;
  createdAt: Date;
  readAt?: Date | null;
};

function toMessageView(m: MessageLean, callerUserId: string): MessageView {
  return {
    id: String(m._id),
    senderRole: m.senderRole,
    mine: String(m.senderUserId) === callerUserId,
    body: m.body,
    createdAt: m.createdAt.toISOString(),
    readAt: m.readAt ? m.readAt.toISOString() : null,
  };
}

/** Unread = messages the OTHER side sent that have no readAt yet. */
async function unreadCountFor(threadId: mongoose.Types.ObjectId, viewerSide: "customer" | "console"): Promise<number> {
  const senderFilter = viewerSide === "customer" ? { $ne: "customer" } : "customer";
  return MessageModel.countDocuments({ threadId, senderRole: senderFilter, readAt: null }).exec();
}

/**
 * The CUSTOMER's messaging surface: their thread with their current agent
 * (created lazily on first send). No agent assigned → `null` thread, which the
 * UI renders as a clean localized empty state.
 */
export async function getCustomerThread(
  customerId: string,
  page = 1
): Promise<{ thread: ThreadView | null; messages: MessageView[]; hasMore: boolean }> {
  if (!isValidObjectId(customerId)) throw new Error("Not authenticated.");
  await connectDB();

  const me = (await UserModel.findById(customerId).select("assignedAgentId businessName").lean().exec()) as {
    assignedAgentId?: mongoose.Types.ObjectId | null;
    businessName?: string;
  } | null;
  if (!me) throw new Error("Not authenticated.");
  if (!me.assignedAgentId) return { thread: null, messages: [], hasMore: false };

  const thread = (await MessageThreadModel.findOne({
    customerId: new mongoose.Types.ObjectId(customerId),
    agentId: me.assignedAgentId,
  })
    .lean()
    .exec()) as ThreadLean | null;

  const agent = (await UserModel.findById(me.assignedAgentId).select("businessName").lean().exec()) as {
    businessName?: string;
  } | null;

  if (!thread) {
    return {
      thread: {
        threadId: "",
        customerId,
        agentId: String(me.assignedAgentId),
        agentName: agent?.businessName ?? "",
        customerName: me.businessName ?? "",
        lastMessageAt: "",
        unreadCount: 0,
      },
      messages: [],
      hasMore: false,
    };
  }

  const { messages, hasMore } = await loadMessages(thread._id, page, customerId);
  // Reading marks the other side's messages as read.
  await MessageModel.updateMany(
    { threadId: thread._id, senderRole: { $ne: "customer" }, readAt: null },
    { $set: { readAt: new Date() } }
  ).exec();

  return {
    thread: {
      threadId: String(thread._id),
      customerId,
      agentId: String(thread.agentId),
      agentName: agent?.businessName ?? "",
      customerName: me.businessName ?? "",
      lastMessageAt: thread.lastMessageAt.toISOString(),
      unreadCount: 0, // just read
    },
    messages,
    hasMore,
  };
}

async function loadMessages(
  threadId: mongoose.Types.ObjectId,
  page: number,
  callerUserId: string
): Promise<{ messages: MessageView[]; hasMore: boolean }> {
  const safePage = Math.max(1, Math.floor(page));
  // Newest LAST (chat order), deterministic (createdAt, _id): fetch newest
  // pages first then reverse for display.
  const docs = (await MessageModel.find({ threadId })
    .sort({ createdAt: -1, _id: -1 })
    .skip((safePage - 1) * PAGE_SIZE)
    .limit(PAGE_SIZE + 1)
    .lean()
    .exec()) as unknown as MessageLean[];
  const hasMore = docs.length > PAGE_SIZE;
  const pageDocs = docs.slice(0, PAGE_SIZE).reverse();
  return { messages: pageDocs.map((m) => toMessageView(m, callerUserId)), hasMore };
}

/** Customer sends to their assigned agent; the thread is created lazily. */
export async function sendCustomerMessage(customerId: string, body: string): Promise<MessageView> {
  const text = body.trim();
  if (!text) throw new Error("Message body is required.");
  if (text.length > MESSAGE_MAX_LENGTH) throw new Error("Message is too long.");
  await connectDB();

  const me = (await UserModel.findById(customerId).select("assignedAgentId").lean().exec()) as {
    assignedAgentId?: mongoose.Types.ObjectId | null;
  } | null;
  if (!me) throw new Error("Not authenticated.");
  if (!me.assignedAgentId) throw new Error("No agent assigned.");

  const thread = await MessageThreadModel.findOneAndUpdate(
    { customerId: new mongoose.Types.ObjectId(customerId), agentId: me.assignedAgentId },
    { $set: { lastMessageAt: new Date() } },
    { upsert: true, returnDocument: "after" }
  ).exec();

  const created = await MessageModel.create({
    threadId: thread._id,
    senderUserId: new mongoose.Types.ObjectId(customerId),
    senderRole: "customer",
    body: text,
  });

  publishRealtimeEvent({
    type: "message.created",
    threadId: String(thread._id),
    customerId,
    agentId: String(me.assignedAgentId),
  });

  return toMessageView(created.toObject() as unknown as MessageLean, customerId);
}

/** Console (agent/admin) thread inbox — agents see only their customers' threads. */
export async function listConsoleThreads(scope: ActorScope): Promise<ThreadView[]> {
  await connectDB();
  const filter =
    scope.role === "admin"
      ? {}
      : { customerId: { $in: scope.customerIds.map((id) => new mongoose.Types.ObjectId(id)) } };
  const threads = (await MessageThreadModel.find(filter)
    .sort({ lastMessageAt: -1 })
    .limit(200)
    .lean()
    .exec()) as unknown as ThreadLean[];

  const userIds = [...new Set(threads.flatMap((t) => [String(t.customerId), String(t.agentId)]))];
  const users = (await UserModel.find({ _id: { $in: userIds } })
    .select("businessName")
    .lean()
    .exec()) as Array<{ _id: unknown; businessName?: string }>;
  const nameById = new Map(users.map((u) => [String(u._id), u.businessName ?? ""]));

  return Promise.all(
    threads.map(async (t) => ({
      threadId: String(t._id),
      customerId: String(t.customerId),
      agentId: String(t.agentId),
      agentName: nameById.get(String(t.agentId)) ?? "",
      customerName: nameById.get(String(t.customerId)) ?? "",
      lastMessageAt: t.lastMessageAt.toISOString(),
      unreadCount: await unreadCountFor(t._id, "console"),
    }))
  );
}

/** Console thread read — ownership via the shared scope guard. */
export async function getConsoleThread(
  scope: ActorScope,
  threadId: string,
  page = 1
): Promise<{ thread: ThreadView; messages: MessageView[]; hasMore: boolean }> {
  if (!isValidObjectId(threadId)) throw new Error("Thread not found.");
  await connectDB();
  const thread = (await MessageThreadModel.findById(threadId).lean().exec()) as ThreadLean | null;
  if (!thread) throw new Error("Thread not found.");
  try {
    assertCanActOnCustomer(scope, String(thread.customerId));
  } catch {
    throw new Error("Thread not found.");
  }

  const users = (await UserModel.find({ _id: { $in: [thread.customerId, thread.agentId] } })
    .select("businessName")
    .lean()
    .exec()) as Array<{ _id: unknown; businessName?: string }>;
  const nameById = new Map(users.map((u) => [String(u._id), u.businessName ?? ""]));

  const { messages, hasMore } = await loadMessages(thread._id, page, scope.userId);
  // Reading from the console marks the CUSTOMER's messages as read.
  await MessageModel.updateMany(
    { threadId: thread._id, senderRole: "customer", readAt: null },
    { $set: { readAt: new Date() } }
  ).exec();

  return {
    thread: {
      threadId: String(thread._id),
      customerId: String(thread.customerId),
      agentId: String(thread.agentId),
      agentName: nameById.get(String(thread.agentId)) ?? "",
      customerName: nameById.get(String(thread.customerId)) ?? "",
      lastMessageAt: thread.lastMessageAt.toISOString(),
      unreadCount: 0,
    },
    messages,
    hasMore,
  };
}

/** Console send — the actor is recorded honestly (admin ≠ agent). */
export async function sendConsoleMessage(
  scope: ActorScope,
  threadId: string,
  body: string
): Promise<MessageView> {
  const text = body.trim();
  if (!text) throw new Error("Message body is required.");
  if (text.length > MESSAGE_MAX_LENGTH) throw new Error("Message is too long.");
  if (!isValidObjectId(threadId)) throw new Error("Thread not found.");
  await connectDB();

  const thread = (await MessageThreadModel.findById(threadId).lean().exec()) as ThreadLean | null;
  if (!thread) throw new Error("Thread not found.");
  try {
    assertCanActOnCustomer(scope, String(thread.customerId));
  } catch {
    throw new Error("Thread not found.");
  }

  const created = await MessageModel.create({
    threadId: thread._id,
    senderUserId: new mongoose.Types.ObjectId(scope.userId),
    senderRole: scope.role, // honest actor — admin replies are labeled admin
    body: text,
  });
  await MessageThreadModel.updateOne({ _id: thread._id }, { $set: { lastMessageAt: new Date() } }).exec();

  publishRealtimeEvent({
    type: "message.created",
    threadId: String(thread._id),
    customerId: String(thread.customerId),
    agentId: String(thread.agentId),
  });

  return toMessageView(created.toObject() as unknown as MessageLean, scope.userId);
}
