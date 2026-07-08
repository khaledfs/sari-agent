import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const cartItemSchema = new Schema(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
  },
  { _id: false }
);

const cartSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    items: {
      type: [cartItemSchema],
      default: [],
    },
  },
  { timestamps: true }
);

cartSchema.index({ userId: 1 }, { unique: true });

export type CartDocument = InferSchemaType<typeof cartSchema>;

export const CartModel: Model<CartDocument> =
  (mongoose.models.Cart as Model<CartDocument>) ||
  mongoose.model<CartDocument>("Cart", cartSchema);
