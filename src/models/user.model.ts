import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const userSchema = new Schema(
  {
    businessName: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    phoneNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ["customer", "admin"],
      default: "customer",
      required: true,
    },
    isVerified: {
      type: Boolean,
      default: false,
      required: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

export type UserDocument = InferSchemaType<typeof userSchema>;

export const UserModel: Model<UserDocument> =
  (mongoose.models.User as Model<UserDocument>) ||
  mongoose.model<UserDocument>("User", userSchema);
