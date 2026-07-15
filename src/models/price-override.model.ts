import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/**
 * Per-customer fixed price for a single product — the highest-precedence rule
 * in the pricing engine (beats businessType tier price and base price).
 */
const priceOverrideSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    productId: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0.01,
    },
  },
  { timestamps: true }
);

priceOverrideSchema.index({ userId: 1, productId: 1 }, { unique: true });
priceOverrideSchema.index({ productId: 1 });

export type PriceOverrideDocument = InferSchemaType<typeof priceOverrideSchema>;

export const PriceOverrideModel: Model<PriceOverrideDocument> =
  (mongoose.models.PriceOverride as Model<PriceOverrideDocument>) ||
  mongoose.model<PriceOverrideDocument>("PriceOverride", priceOverrideSchema);
