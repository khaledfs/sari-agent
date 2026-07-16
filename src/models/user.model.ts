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
    /**
     * LEGACY (superseded 2026-07-16 by accountStatus — Work Order Issue 3).
     * Previously false = login rejected. Login is no longer blocked; the flag
     * is kept only so unmigrated documents can be mapped to accountStatus
     * (isActive false → "restricted"). Do not enforce it anywhere new.
     */
    isActive: {
      type: Boolean,
      default: true,
      required: true,
    },
    /**
     * Ordering permission — the single source of truth (Work Order Issue 3).
     * "restricted" = commercial hold: the customer stays logged in and keeps
     * read access (orders, ledger, catalog, receipts) but cannot mutate the
     * cart or place orders. Not a security ban.
     */
    accountStatus: {
      type: String,
      enum: ["active", "restricted"],
      default: "active",
    },
    /** Set when accountStatus flips to "restricted". */
    restrictedAt: {
      type: Date,
      default: undefined,
    },
    /** Admin-facing reason for the hold (never shown to the customer). */
    restrictedReason: {
      type: String,
      trim: true,
      maxlength: 500,
      default: undefined,
    },
    /** Internal admin notes — never exposed through customer-facing endpoints. */
    adminNotes: {
      type: String,
      default: "",
      maxlength: 1000,
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
