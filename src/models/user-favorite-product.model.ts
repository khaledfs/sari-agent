import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/**
 * Explicit customer favorites only: one row per (userId, productId).
 * Not inferred from purchase frequency — use UserFavoriteProduct for user-marked favorites.
 */
const userFavoriteProductSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    productId: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

userFavoriteProductSchema.index({ userId: 1, productId: 1 }, { unique: true });

export type UserFavoriteProductDocument = InferSchemaType<typeof userFavoriteProductSchema>;

export const UserFavoriteProductModel: Model<UserFavoriteProductDocument> =
  (mongoose.models.UserFavoriteProduct as Model<UserFavoriteProductDocument>) ||
  mongoose.model<UserFavoriteProductDocument>("UserFavoriteProduct", userFavoriteProductSchema);
