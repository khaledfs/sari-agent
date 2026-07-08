import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const clarificationOptionSchema = new Schema(
  {
    productId: { type: String, required: true },
    name: { type: String, required: true },
    sku: { type: String, default: "" },
    price: { type: Number, required: true },
    unit: { type: String, default: "" },
    packageSize: { type: String, default: "" },
    imageUrl: { type: String, required: false },
  },
  { _id: false }
);

const compareContextSchema = new Schema(
  {
    phase: { type: String, enum: ["left", "right"], required: true },
    leftQuery: { type: String, required: true },
    rightQuery: { type: String, required: true },
    anchoredSide: { type: String, enum: ["left", "right"], required: false },
    anchoredProduct: { type: clarificationOptionSchema, required: false },
    firstPick: { type: clarificationOptionSchema, required: false },
    secondStepOptions: { type: [clarificationOptionSchema], required: false },
  },
  { _id: false }
);

const assistantClarificationSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    intent: {
      type: String,
      required: true,
      enum: ["add", "update", "remove", "info", "compare", "reorder_habit", "clarify"],
    },
    originalMessage: { type: String, required: true },
    productQuery: { type: String, default: null },
    productQueries: { type: [String], default: [] },
    quantity: { type: Number, default: null },
    flowType: { type: String, enum: ["single", "compare"], default: "single", required: true },
    step: { type: String, enum: ["select_first", "select_second"], required: false },
    firstProductId: { type: String, required: false },
    question: { type: String, required: true },
    options: { type: [clarificationOptionSchema], default: [] },
    compareContext: { type: compareContextSchema, required: false },
    status: {
      type: String,
      required: true,
      enum: ["pending", "resolved", "expired"],
      default: "pending",
      index: true,
    },
    expiresAt: { type: Date, required: true },
    resolvedAt: { type: Date, required: false },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

assistantClarificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
assistantClarificationSchema.index({ userId: 1, status: 1, createdAt: -1 });

export type AssistantClarificationDocument = InferSchemaType<typeof assistantClarificationSchema>;

export const AssistantClarificationModel: Model<AssistantClarificationDocument> =
  (mongoose.models.AssistantClarification as Model<AssistantClarificationDocument>) ||
  mongoose.model<AssistantClarificationDocument>("AssistantClarification", assistantClarificationSchema);
