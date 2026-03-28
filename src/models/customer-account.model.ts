import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

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
  },
  { timestamps: true }
);

customerAccountSchema.index({ userId: 1 }, { unique: true });

export type CustomerAccountDocument = InferSchemaType<typeof customerAccountSchema>;

export const CustomerAccountModel: Model<CustomerAccountDocument> =
  (mongoose.models.CustomerAccount as Model<CustomerAccountDocument>) ||
  mongoose.model<CustomerAccountDocument>("CustomerAccount", customerAccountSchema);
