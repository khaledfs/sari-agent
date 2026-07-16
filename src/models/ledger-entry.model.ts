import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/**
 * Customer ledger entries (Work Order Issue 8).
 *
 * MONEY IS STORED AS INTEGERS IN MINOR UNITS (agorot) — the codebase has no
 * Decimal128 usage anywhere, so integer minor units were chosen; no
 * floating-point arithmetic touches these fields.
 *
 * Sign convention: `order_charge` and `adjustment` post as DEBIT (increase
 * what the customer owes); `payment` / `credit` / `refund` post as CREDIT
 * (reduce it). Balance = Σdebit − Σcredit over POSTED entries in
 * chronological order (createdAt, _id tiebreak).
 *
 * Posted entries are IMMUTABLE — corrections are compensating reversals
 * (status "void" is reserved for reversal bookkeeping, entries are never
 * deleted or edited).
 */

export const LEDGER_ENTRY_TYPES = [
  "order_charge",
  "payment",
  "credit",
  "refund",
  "adjustment",
  "opening_balance",
] as const;

export type LedgerEntryType = (typeof LEDGER_ENTRY_TYPES)[number];

const ledgerEntrySchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: LEDGER_ENTRY_TYPES,
      required: true,
    },
    /** Present on order_charge and order reversals. */
    orderId: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      default: undefined,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    /** Agorot. Exactly one of debitMinor/creditMinor is non-zero. */
    debitMinor: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      validate: { validator: Number.isInteger, message: "debitMinor must be an integer." },
    },
    creditMinor: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      validate: { validator: Number.isInteger, message: "creditMinor must be an integer." },
    },
    currency: {
      type: String,
      required: true,
      default: "ILS",
    },
    createdByUserId: {
      type: String,
      default: undefined,
    },
    createdByRole: {
      type: String,
      default: undefined,
    },
    status: {
      type: String,
      enum: ["posted", "void"],
      default: "posted",
      required: true,
    },
    /** Uniqueness = write idempotency (e.g. order_charge:<orderId>). */
    idempotencyKey: {
      type: String,
      required: true,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

ledgerEntrySchema.index({ idempotencyKey: 1 }, { unique: true });
/** Deterministic chronological reads per customer. */
ledgerEntrySchema.index({ userId: 1, createdAt: 1, _id: 1 });

export type LedgerEntryDocument = InferSchemaType<typeof ledgerEntrySchema>;

export const LedgerEntryModel: Model<LedgerEntryDocument> =
  (mongoose.models.LedgerEntry as Model<LedgerEntryDocument>) ||
  mongoose.model<LedgerEntryDocument>("LedgerEntry", ledgerEntrySchema);
