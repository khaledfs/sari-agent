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
      enum: ["customer", "admin", "agent"],
      default: "customer",
      required: true,
    },
    /**
     * Field agent responsible for this customer (Work Order 2, Task D).
     * Nullable by design — new customers start unassigned and must work
     * everywhere without an agent. At most one agent per customer.
     */
    assignedAgentId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    /** Agent metadata: the route/line this agent drives (agents only). */
    routeLabel: {
      type: String,
      trim: true,
      maxlength: 120,
      default: undefined,
    },
    /**
     * Agent lifecycle — soft removal ("fire the agent"). AGENTS only.
     * "active" (or missing, on unmigrated docs) = normal. "removed" = fired:
     * the user document and ALL history (orders, ledger, messages) stay intact,
     * but login is refused and the per-request scope resolver denies access on
     * the next call (session dies without a hard logout). Never a hard delete —
     * every reference to the agent by id still resolves. Additive: existing
     * agents have no value and read as active.
     */
    agentStatus: {
      type: String,
      enum: ["active", "removed"],
      default: "active",
    },
    /** Set when an agent is removed (audit). */
    removedAt: {
      type: Date,
      default: undefined,
    },
    /** Admin who removed the agent (audit). */
    removedByUserId: {
      type: String,
      default: undefined,
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
