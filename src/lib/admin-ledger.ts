import { isValidObjectId } from "mongoose";

import { requireAdmin } from "@/lib/auth-user";
import { connectDB } from "@/lib/db";
import { UserModel } from "@/models/user.model";
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
  await requireAdmin();
  if (!isValidObjectId(customerId)) {
    throw new Error("Customer not found.");
  }
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
};

/**
 * Admin records a payment / credit / adjustment. Amount arrives in MAJOR
 * units (₪ from the form), is validated positive with ≤2 decimals, and is
 * converted to agorot exactly once at this boundary. The actor is recorded;
 * an explicit duplicate idempotency key is rejected.
 */
export async function postAdminLedgerEntry(
  customerId: string,
  input: AdminLedgerPostInput
): Promise<{ entryId: string }> {
  const actor = await requireAdmin();
  if (!isValidObjectId(customerId)) {
    throw new Error("Customer not found.");
  }

  const type = String(input.type ?? "");
  if (!(ADMIN_POSTABLE_TYPES as readonly string[]).includes(type)) {
    throw new Error("Type must be payment, credit, or adjustment.");
  }
  const amount = input.amount;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    throw new Error("Amount must be a positive number.");
  }
  const description = typeof input.description === "string" ? input.description.trim() : "";
  if (!description) {
    throw new Error("Description is required.");
  }
  const idempotencyKey =
    typeof input.idempotencyKey === "string" && input.idempotencyKey.trim()
      ? input.idempotencyKey.trim()
      : undefined;

  await connectDB();
  const exists = await UserModel.exists({ _id: customerId, role: "customer" });
  if (!exists) {
    throw new Error("Customer not found.");
  }

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
