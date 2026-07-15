import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

export const PROMOTION_KINDS = ["gift", "orderDiscount", "minOrderGift"] as const;
export type PromotionKind = (typeof PROMOTION_KINDS)[number];

export const PROMOTION_SCOPES = ["customer", "businessType", "global"] as const;
export type PromotionScope = (typeof PROMOTION_SCOPES)[number];

/**
 * One promotion. Kind-specific fields (flat, validated in admin-promotions):
 * - gift:         buy buyProductId with qty >= buyMinQty → giftProductId × giftQty free
 * - orderDiscount: subtotal >= threshold → percent|fixed off the order total
 * - minOrderGift:  subtotal >= threshold → giftProductId × giftQty free
 */
const promotionSchema = new Schema(
  {
    label: {
      type: String,
      trim: true,
      default: "",
    },
    kind: {
      type: String,
      enum: PROMOTION_KINDS,
      required: true,
    },
    /** Audience — same shape as discounts. */
    scope: {
      type: String,
      enum: PROMOTION_SCOPES,
      required: true,
    },
    targetId: {
      type: String,
      trim: true,
      default: "",
    },

    // gift
    buyProductId: { type: Schema.Types.ObjectId, default: null },
    buyMinQty: { type: Number, default: null },
    giftProductId: { type: Schema.Types.ObjectId, default: null },
    giftQty: { type: Number, default: null },

    // orderDiscount / minOrderGift
    threshold: { type: Number, default: null },
    discountType: { type: String, enum: ["percent", "fixed", null], default: null },
    value: { type: Number, default: null },

    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    isActive: { type: Boolean, default: true, required: true },
  },
  { timestamps: true }
);

promotionSchema.index({ isActive: 1, scope: 1, targetId: 1 });

export type PromotionDocument = InferSchemaType<typeof promotionSchema>;

export const PromotionModel: Model<PromotionDocument> =
  (mongoose.models.Promotion as Model<PromotionDocument>) ||
  mongoose.model<PromotionDocument>("Promotion", promotionSchema);
