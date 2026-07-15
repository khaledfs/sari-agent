import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const productSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    sku: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    category: {
      type: String,
      trim: true,
      default: "",
    },
    price: {
      type: Number,
      required: true,
      min: 0.01,
    },
    unit: {
      type: String,
      trim: true,
      default: "",
    },
    packageSize: {
      type: String,
      trim: true,
      default: "",
    },
    imageUrl: {
      type: String,
      trim: true,
      default: "",
    },
    isActive: {
      type: Boolean,
      default: true,
      required: true,
    },
    /** Inventory count; null = stock not tracked for this product (default). */
    stock: {
      type: Number,
      default: null,
      min: 0,
    },
    /** "Low stock" warning level for admin screens (only meaningful when stock is tracked). */
    lowStockThreshold: {
      type: Number,
      default: 10,
      min: 0,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

productSchema.index({ sku: 1 }, { unique: true });
/** Speeds up customer catalog: active products by category, newest first. */
productSchema.index({ isActive: 1, category: 1, createdAt: -1 });

export type ProductDocument = InferSchemaType<typeof productSchema>;

export const ProductModel: Model<ProductDocument> =
  (mongoose.models.Product as Model<ProductDocument>) ||
  mongoose.model<ProductDocument>("Product", productSchema);

