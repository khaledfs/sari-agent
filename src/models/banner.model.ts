import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

export const BANNER_SCOPES = ["customer", "businessType", "global"] as const;
export type BannerScope = (typeof BANNER_SCOPES)[number];

/**
 * Admin-managed customer announcement. Content (title/body/CTA text) is
 * written by the admin in whatever language fits their customers — the UI
 * chrome around it is localized separately.
 */
const bannerSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    body: {
      type: String,
      trim: true,
      default: "",
    },
    imageUrl: {
      type: String,
      trim: true,
      default: "",
    },
    ctaLabel: {
      type: String,
      trim: true,
      default: "",
    },
    /** Internal path only ("/he/dashboard/products") — validated to start with "/". */
    ctaHref: {
      type: String,
      trim: true,
      default: "",
    },
    scope: {
      type: String,
      enum: BANNER_SCOPES,
      required: true,
    },
    targetId: {
      type: String,
      trim: true,
      default: "",
    },
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    isActive: { type: Boolean, default: true, required: true },
    /** Higher shows first. */
    priority: { type: Number, default: 0 },
  },
  { timestamps: true }
);

bannerSchema.index({ isActive: 1, scope: 1, targetId: 1 });

export type BannerDocument = InferSchemaType<typeof bannerSchema>;

export const BannerModel: Model<BannerDocument> =
  (mongoose.models.Banner as Model<BannerDocument>) ||
  mongoose.model<BannerDocument>("Banner", bannerSchema);
