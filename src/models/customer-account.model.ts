import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

import { BUSINESS_TYPES, SIZE_BANDS } from "@/types/business-segmentation";

const customerAccountSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    businessName: {
      type: String,
      required: true,
      trim: true,
    },
    phoneNumber: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    balance: {
      type: Number,
      default: 0,
    },
    totalDebt: {
      type: Number,
      default: 0,
    },
    lastPaymentDate: {
      type: Date,
    },
    /** Broad segment for cohorting / future ML (optional until collected in UI). */
    businessType: {
      type: String,
      trim: true,
      enum: BUSINESS_TYPES,
    },
    /** Niche within businessType (free text). */
    specialization: {
      type: String,
      trim: true,
      default: "",
    },
    /** Operational scale band (optional). */
    sizeBand: {
      type: String,
      trim: true,
      enum: SIZE_BANDS,
    },
  },
  { timestamps: true }
);

customerAccountSchema.index({ userId: 1 }, { unique: true });

export type CustomerAccountDocument = InferSchemaType<typeof customerAccountSchema>;

export const CustomerAccountModel: Model<CustomerAccountDocument> =
  (mongoose.models.CustomerAccount as Model<CustomerAccountDocument>) ||
  mongoose.model<CustomerAccountDocument>("CustomerAccount", customerAccountSchema);
