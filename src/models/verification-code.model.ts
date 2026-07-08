import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const verificationCodeSchema = new Schema(
  {
    phoneNumber: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    code: {
      type: String,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

verificationCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type VerificationCodeDocument = InferSchemaType<
  typeof verificationCodeSchema
>;

export const VerificationCodeModel: Model<VerificationCodeDocument> =
  (mongoose.models.VerificationCode as Model<VerificationCodeDocument>) ||
  mongoose.model<VerificationCodeDocument>(
    "VerificationCode",
    verificationCodeSchema
  );
