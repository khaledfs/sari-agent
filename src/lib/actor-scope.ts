import mongoose, { isValidObjectId } from "mongoose";

import { requireConsoleUser } from "@/lib/auth-user";
import { connectDB } from "@/lib/db";
import { FORBIDDEN_SCOPE_MESSAGE } from "@/lib/scope-errors";
import { UserModel } from "@/models/user.model";

/**
 * THE console authorization layer (Work Order 2, Task D).
 *
 * One shared scope resolver used by EVERY admin-side surface — no per-route
 * hand-rolled checks. The scope is loaded from the DATABASE on every request
 * (role and assignments can change after a token was issued; token claims are
 * only the entry ticket). Deny by default:
 * - scope violation (another agent's customer) → "…not found." → 404 (no
 *   existence leak);
 * - role violation (agent on an admin-only surface) → FORBIDDEN_SCOPE → 403.
 * Client-supplied agentId/customerId values are never trusted for scoping —
 * the customer set is derived here from the session identity alone.
 */

export type ActorScope =
  | { role: "admin"; userId: string }
  | { role: "agent"; userId: string; customerIds: string[] };

/** Resolves the current console actor (admin or agent) with FRESH DB state. */
export async function resolveActorScope(): Promise<ActorScope> {
  const payload = await requireConsoleUser();
  await connectDB();

  // Current role from the DB — a demoted/deleted user must lose access even
  // with a still-valid token.
  const user = (await UserModel.findById(payload.userId).select("role agentStatus").lean().exec()) as {
    role?: string;
    agentStatus?: string;
  } | null;
  if (!user) {
    throw new Error("Not authenticated.");
  }
  if (user.role === "admin") {
    return { role: "admin", userId: payload.userId };
  }
  if (user.role !== "agent") {
    throw new Error("Access denied.");
  }
  // A removed (fired) agent loses console access on the very next request —
  // per-request check, mirroring the restricted-customer guard. No hard logout.
  if (user.agentStatus === "removed") {
    throw new Error("Access denied.");
  }

  const assigned = (await UserModel.find({
    role: "customer",
    assignedAgentId: new mongoose.Types.ObjectId(payload.userId),
  })
    .select("_id")
    .lean()
    .exec()) as Array<{ _id: unknown }>;

  return {
    role: "agent",
    userId: payload.userId,
    customerIds: assigned.map((u) => String(u._id)),
  };
}

/** Admin-only surface: agents get the stable 403 FORBIDDEN_SCOPE error. */
export function assertAdminOnly(scope: ActorScope): void {
  if (scope.role !== "admin") {
    throw new Error(FORBIDDEN_SCOPE_MESSAGE);
  }
}

/**
 * Customer-scoped action: admins pass for any customer; agents pass only for
 * their own. Violations read as "Customer not found." (→ 404, no leak).
 */
export function assertCanActOnCustomer(scope: ActorScope, customerId: string): void {
  if (!isValidObjectId(customerId)) {
    throw new Error("Customer not found.");
  }
  if (scope.role === "admin") return;
  if (!scope.customerIds.includes(String(customerId))) {
    throw new Error("Customer not found.");
  }
}

/**
 * Mongo filter fragment restricting a query with a customer/user id field to
 * the actor's customers. `null` = unrestricted (admin).
 */
export function scopedCustomerObjectIds(scope: ActorScope): mongoose.Types.ObjectId[] | null {
  if (scope.role === "admin") return null;
  return scope.customerIds.filter((id) => isValidObjectId(id)).map((id) => new mongoose.Types.ObjectId(id));
}
