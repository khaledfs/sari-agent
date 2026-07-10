import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/**
 * Business types driving per-customer AI behavior (advisor tone, product
 * priorities, seasonal patterns). Deliberately its own enum — NOT the broader
 * analytics enum in src/types/business-segmentation.ts (CustomerAccount) —
 * because the AI memory feature spec fixes exactly these five values.
 */
export const CUSTOMER_MEMORY_BUSINESS_TYPES = [
  "bakery",
  "oriental_sweets",
  "western_sweets",
  "cafe",
  "ice_cream",
] as const;

export type CustomerMemoryBusinessType = (typeof CUSTOMER_MEMORY_BUSINESS_TYPES)[number];

const inferredPreferencesSchema = new Schema(
  {
    preferredCategories: { type: [String], default: [] },
    avoidedProducts: { type: [String], default: [] },
    notedFacts: { type: [String], default: [] },
  },
  { _id: false }
);

const customerMemorySchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    /** Optional — inferred over time from conversations if not set at registration. */
    businessType: {
      type: String,
      enum: CUSTOMER_MEMORY_BUSINESS_TYPES,
    },
    /** Plain-text summary written by OpenAI (kept under ~600 tokens). */
    memorySummary: {
      type: String,
      trim: true,
      default: "",
    },
    lastUpdatedAt: {
      type: Date,
      default: Date.now,
    },
    conversationCount: {
      type: Number,
      default: 0,
    },
    inferredPreferences: {
      type: inferredPreferencesSchema,
      default: () => ({ preferredCategories: [], avoidedProducts: [], notedFacts: [] }),
    },
  },
  { timestamps: true }
);

customerMemorySchema.index({ userId: 1 }, { unique: true });

export type CustomerMemoryDocument = InferSchemaType<typeof customerMemorySchema>;

export const CustomerMemoryModel: Model<CustomerMemoryDocument> =
  (mongoose.models.CustomerMemory as Model<CustomerMemoryDocument>) ||
  mongoose.model<CustomerMemoryDocument>("CustomerMemory", customerMemorySchema);
