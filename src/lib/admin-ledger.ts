import { isValidObjectId } from "mongoose";

import { assertCanActOnCustomer, resolveActorScope } from "@/lib/actor-scope";
import { connectDB } from "@/lib/db";
import { UserModel } from "@/models/user.model";
import {
  findOpenTaskIdForOrder,
  getOpenCollectionsForCustomer,
  recordCollectionPayment,
  type CollectionPaymentResult,
} from "@/services/collection-tasks.service";
import {
  ADMIN_POSTABLE_TYPES,
  getLedgerForUser,
  postLedgerEntry,
  toMinorUnits,
  type LedgerPage,
} from "@/services/ledger.service";

/**
 * Admin ledger access (Work Order Issue 8), mirroring admin-orders/admin-customers:
 * requireAdmin per request, plain Error messages mapped in thin routes.
 */

export async function getAdminCustomerLedger(
  customerId: string,
  params: { page?: number; pageSize?: number } = {}
): Promise<LedgerPage> {
  // Task D: reading a customer's ledger and recording payments/cheques is
  // literally the field agent's job — allowed for THEIR customers only.
  const scope = await resolveActorScope();
  assertCanActOnCustomer(scope, customerId);
  await connectDB();
  const exists = await UserModel.exists({ _id: customerId, role: "customer" });
  if (!exists) {
    throw new Error("Customer not found.");
  }
  return getLedgerForUser(customerId, params);
}

export type AdminLedgerPostInput = {
  type?: unknown;
  amount?: unknown;
  description?: unknown;
  idempotencyKey?: unknown;
  /** For a `payment` that settles a collection: which order it pays. */
  orderId?: unknown;
  method?: unknown; // "cash" | "cheque"
  chequeNumber?: unknown;
  chequeDate?: unknown; // ISO
  chequeBank?: unknown;
};

/** Thrown (→ 400) when a payment is recorded without saying which collection it settles. */
export const LEDGER_PAYMENT_NEEDS_ORDER_MESSAGE =
  "This customer has open collections — record the payment against its order.";

/**
 * Admin records a payment / credit / adjustment. Amount arrives in MAJOR units
 * (₪ from the form), validated positive ≤2 decimals, converted to agorot once
 * here. Actor recorded.
 *
 * PAYMENTS ARE UNIFIED WITH COLLECTIONS: a `payment` that names an `orderId`
 * flows through the SAME `recordCollectionPayment` path as the collect button —
 * one order-anchored entry, overpay-guarded, settling the task. While the
 * customer has open collections, an UNLINKED payment is rejected (that was the
 * double-counting hole). Credits/adjustments are corrections and unchanged.
 */
export async function postAdminLedgerEntry(
  customerId: string,
  input: AdminLedgerPostInput
): Promise<{ entryId: string; collection?: CollectionPaymentResult }> {
  const scope = await resolveActorScope();
  assertCanActOnCustomer(scope, customerId);
  const actor = { userId: scope.userId, role: scope.role };

  const type = String(input.type ?? "");
  if (!(ADMIN_POSTABLE_TYPES as readonly string[]).includes(type)) {
    throw new Error("Type must be payment, credit, or adjustment.");
  }
  const amount = input.amount;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    throw new Error("Amount must be a positive number.");
  }
  const description = typeof input.description === "string" ? input.description.trim() : "";

  await connectDB();
  const exists = await UserModel.exists({ _id: customerId, role: "customer" });
  if (!exists) {
    throw new Error("Customer not found.");
  }

  if (type === "payment") {
    const orderId = typeof input.orderId === "string" && isValidObjectId(input.orderId) ? input.orderId : null;
    if (orderId) {
      const taskId = await findOpenTaskIdForOrder(orderId);
      if (!taskId) throw new Error("No open collection for that order.");
      const collection = await recordCollectionPayment(scope, taskId, {
        amountMinor: toMinorUnits(amount),
        method: input.method === "cheque" ? "cheque" : "cash",
        chequeNumber: typeof input.chequeNumber === "string" ? input.chequeNumber : undefined,
        chequeDate: typeof input.chequeDate === "string" ? input.chequeDate : undefined,
        chequeBank: typeof input.chequeBank === "string" ? input.chequeBank : undefined,
        note: description || undefined,
      });
      return { entryId: "", collection };
    }
    // No order named — forbid an unlinked payment while collections are open,
    // so ledger + collections can never independently post for the same debt.
    const open = await getOpenCollectionsForCustomer(customerId);
    if (open.length > 0) {
      throw new Error(LEDGER_PAYMENT_NEEDS_ORDER_MESSAGE);
    }
    if (!description) throw new Error("Description is required.");
    const posted = await postLedgerEntry({
      userId: customerId,
      type: "payment",
      amountMinor: toMinorUnits(amount),
      description,
      actor: { userId: actor.userId, role: actor.role },
      onDuplicate: "error",
    });
    return { entryId: posted.entryId };
  }

  // credit / adjustment — corrections, unchanged.
  if (!description) throw new Error("Description is required.");
  const idempotencyKey =
    typeof input.idempotencyKey === "string" && input.idempotencyKey.trim() ? input.idempotencyKey.trim() : undefined;
  const posted = await postLedgerEntry({
    userId: customerId,
    type: type as (typeof ADMIN_POSTABLE_TYPES)[number],
    amountMinor: toMinorUnits(amount),
    description,
    idempotencyKey,
    actor: { userId: actor.userId, role: actor.role },
    onDuplicate: "error",
  });
  return { entryId: posted.entryId };
}
