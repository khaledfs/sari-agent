import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const orderItemSchema = new Schema(
  {
    productId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    price: {
      type: Number,
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    /**
     * Pricing-engine audit snapshot for this line (absent on legacy orders and
     * whenever the computed price === base with no rule applied is fine too —
     * we always store it for new orders). See pricing.service.ts.
     */
    priceBreakdown: {
      type: new Schema(
        {
          base: { type: Number, required: true },
          tier: { type: Number, default: undefined },
          override: { type: Number, default: undefined },
          discountApplied: {
            type: new Schema(
              {
                discountId: { type: String, required: true },
                discountType: { type: String, required: true },
                value: { type: Number, required: true },
                amountOff: { type: Number, required: true },
              },
              { _id: false }
            ),
            default: undefined,
          },
          final: { type: Number, required: true },
        },
        { _id: false }
      ),
      default: undefined,
    },
    /** Set on promotion gift lines (price 0). */
    isGift: {
      type: Boolean,
      default: undefined,
    },
    /** Promotion that produced this line (gift lines only). */
    promotionId: {
      type: String,
      default: undefined,
    },
    /**
     * Warehouse shortage handling: `quantity` above stays the ORDERED quantity
     * forever (customer evidence, never overwritten). `suppliedQuantity` is what
     * was actually supplied — absent ⇒ treat as equal to `quantity`
     * (0 ≤ supplied ≤ ordered; decrease-only). Totals/receipts use supplied.
     */
    suppliedQuantity: {
      type: Number,
      default: undefined,
      min: 0,
    },
    /** Admin/agent note explaining a supply shortfall on this line. */
    adjustmentNote: {
      type: String,
      trim: true,
      maxlength: 500,
      default: undefined,
    },
    /** Per-line audit trail of supply adjustments (same shape as statusHistory). */
    adjustmentHistory: {
      type: [
        new Schema(
          {
            fromQuantity: { type: Number, required: true },
            toQuantity: { type: Number, required: true },
            note: { type: String, trim: true, default: "" },
            changedAt: { type: Date, required: true },
            changedByUserId: { type: String, required: true },
            changedByRole: { type: String, required: true },
          },
          { _id: false }
        ),
      ],
      default: undefined,
    },
  },
  { _id: false }
);

const statusHistoryEntrySchema = new Schema(
  {
    status: { type: String, required: true, trim: true },
    changedAt: { type: Date, required: true },
    changedByUserId: { type: String, required: true },
    changedByRole: { type: String, required: true },
  },
  { _id: false }
);

const orderSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    items: {
      type: [orderItemSchema],
      required: true,
      default: [],
    },
    total: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      default: "pending",
      trim: true,
    },
    /** Optional customer delivery notes captured at checkout. */
    notes: {
      type: String,
      trim: true,
      maxlength: 500,
      default: undefined,
    },
    /**
     * Audit trail of admin status changes (additive; empty on orders created
     * before this field existed — render that gracefully, never fabricate).
     */
    statusHistory: {
      type: [statusHistoryEntrySchema],
      default: [],
    },
    /** Promotions that contributed gifts/discounts to this order. */
    appliedPromotionIds: {
      type: [String],
      default: undefined,
    },
    /** Order-level promotion discount applied to the total (audit). */
    promotionDiscount: {
      type: new Schema(
        {
          promotionId: { type: String, required: true },
          discountType: { type: String, required: true },
          value: { type: Number, required: true },
          amountOff: { type: Number, required: true },
        },
        { _id: false }
      ),
      default: undefined,
    },
    /**
     * Supply-adjustment markers (warehouse shortage). `adjusted` lets lists
     * badge the order without scanning items; `adjustmentSeenAt` is when the
     * customer acknowledged it (drives the unseen marker). Additive — legacy
     * orders have neither.
     */
    adjusted: {
      type: Boolean,
      default: undefined,
    },
    adjustedAt: {
      type: Date,
      default: undefined,
    },
    adjustedByUserId: {
      type: String,
      default: undefined,
    },
    adjustedByRole: {
      type: String,
      default: undefined,
    },
    adjustmentSeenAt: {
      type: Date,
      default: undefined,
    },
    /** Monotonic adjustment count — the ledger correction's idempotency key. */
    adjustmentRevision: {
      type: Number,
      default: undefined,
    },
    /**
     * Payment (additive). Card is confirmed ONLY by a signed provider webhook;
     * agent is cash/cheque collected in person. Card numbers are NEVER stored —
     * only the provider's opaque intent id. Amounts settle through the ledger.
     */
    paymentMethod: {
      type: String,
      enum: ["card", "agent"],
      default: undefined,
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed", "collect_via_agent"],
      default: undefined,
    },
    /** Opaque provider payment-intent id (never card data). */
    paymentIntentId: {
      type: String,
      default: undefined,
    },
    paidAt: {
      type: Date,
      default: undefined,
    },
    /**
     * Stock commitment stamps (idempotency): stock is decremented exactly once
     * per order (card → on paid webhook; agent → on dispatch) and returned once
     * on cancel. Presence of the stamp makes a retry/replay a no-op.
     */
    stockCommittedAt: {
      type: Date,
      default: undefined,
    },
    stockReturnedAt: {
      type: Date,
      default: undefined,
    },
  },
  { timestamps: true }
);

orderSchema.index({ userId: 1, createdAt: -1 });

export type OrderDocument = InferSchemaType<typeof orderSchema>;

export const OrderModel: Model<OrderDocument> =
  (mongoose.models.Order as Model<OrderDocument>) ||
  mongoose.model<OrderDocument>("Order", orderSchema);
