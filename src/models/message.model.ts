import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/**
 * Customer ↔ field-agent messaging (Work Order 2, Task D).
 * One thread per (customer, agent) pair; text-only messages (no uploads in
 * this task). This is HUMAN messaging — deliberately separate from the AI
 * assistant surfaces. History is immutable; reassigning a customer to a new
 * agent starts a NEW thread, old threads stay readable (handover semantics).
 */

const messageThreadSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    agentId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    lastMessageAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

messageThreadSchema.index({ customerId: 1, agentId: 1 }, { unique: true });
messageThreadSchema.index({ agentId: 1, lastMessageAt: -1 });

export type MessageThreadDocument = InferSchemaType<typeof messageThreadSchema>;

export const MessageThreadModel: Model<MessageThreadDocument> =
  (mongoose.models.MessageThread as Model<MessageThreadDocument>) ||
  mongoose.model<MessageThreadDocument>("MessageThread", messageThreadSchema);

export const MESSAGE_MAX_LENGTH = 2000;

const messageSchema = new Schema(
  {
    threadId: { type: Schema.Types.ObjectId, ref: "MessageThread", required: true, index: true },
    senderUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    /** Honest actor role — an admin replying is recorded as admin, never as the agent. */
    senderRole: { type: String, enum: ["customer", "agent", "admin"], required: true },
    body: { type: String, required: true, trim: true, maxlength: MESSAGE_MAX_LENGTH },
    readAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

/** Deterministic pagination: chronological with id tiebreak. */
messageSchema.index({ threadId: 1, createdAt: 1, _id: 1 });

export type MessageDocument = InferSchemaType<typeof messageSchema>;

export const MessageModel: Model<MessageDocument> =
  (mongoose.models.Message as Model<MessageDocument>) ||
  mongoose.model<MessageDocument>("Message", messageSchema);
