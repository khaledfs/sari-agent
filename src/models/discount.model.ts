import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

export const DISCOUNT_SCOPES = ["customer", "businessType", "global"] as const;
export type DiscountScope = (typeof DISCOUNT_SCOPES)[number];

export const DISCOUNT_TYPES = ["percent", "fixed"] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

const discountSchema = new Schema(
  {
    /** Admin-facing label ("Bakeries July -10%"). */
    label: {
      type: String,
      trim: true,
      default: "",
    },
    scope: {
      type: String,
      enum: DISCOUNT_SCOPES,
      required: true,
    },
    /** userId (scope=customer) or businessType value (scope=businessType); unused for global. */
    targetId: {
      type: String,
      trim: true,
      default: "",
    },
    type: {
      type: String,
      enum: DISCOUNT_TYPES,
      required: true,
    },
    /** percent: 1–90; fixed: ₪ amount > 0. */
    value: {
      type: Number,
      required: true,
    },
    /** Empty = applies to all products. */
    productIds: {
      type: [Schema.Types.ObjectId],
      default: [],
    },
    startsAt: {
      type: Date,
      default: null,
    },
    endsAt: {
      type: Date,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
      required: true,
    },
  },
  { timestamps: true }
);

discountSchema.index({ isActive: 1, scope: 1, targetId: 1 });

export type DiscountDocument = InferSchemaType<typeof discountSchema>;

export const DiscountModel: Model<DiscountDocument> =
  (mongoose.models.Discount as Model<DiscountDocument>) ||
  mongoose.model<DiscountDocument>("Discount", discountSchema);
