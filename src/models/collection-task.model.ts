import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

export const COLLECTION_TASK_STATUSES = ["open", "collected", "cancelled"] as const;
export type CollectionTaskStatus = (typeof COLLECTION_TASK_STATUSES)[number];

/**
 * Agent cash/cheque collection task (payment feature). Created when an
 * "agent"-paid order is approved (confirmed); the assigned agent collects in
 * person and marks it collected, which posts the ledger payment. No assigned
 * agent → agentId is null and the task surfaces to the admin (never dropped).
 *
 * The amount is copied from the ORDER at creation (server-side, minor units) —
 * never trusted from a client. One task per order (unique orderId).
 */
const collectionTaskSchema = new Schema(
  {
    orderId: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      unique: true,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    /** Assigned agent, or null when the customer has no agent (admin-owned). */
    agentId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    /** Amount to collect, in agorot (integer) — copied from the order. */
    amountMinor: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: COLLECTION_TASK_STATUSES,
      default: "open",
      required: true,
    },
    collectedAt: { type: Date, default: undefined },
    /** Actor who marked it collected (audit). */
    collectedByUserId: { type: String, default: undefined },
    note: { type: String, trim: true, maxlength: 500, default: undefined },
  },
  { timestamps: true }
);

collectionTaskSchema.index({ status: 1, agentId: 1 });

export type CollectionTaskDocument = InferSchemaType<typeof collectionTaskSchema>;

export const CollectionTaskModel: Model<CollectionTaskDocument> =
  (mongoose.models.CollectionTask as Model<CollectionTaskDocument>) ||
  mongoose.model<CollectionTaskDocument>("CollectionTask", collectionTaskSchema);
