import { isValidObjectId } from "mongoose";

import { connectDB } from "@/lib/db";
import { UserModel } from "@/models/user.model";

/**
 * Account ordering-permission guard (Work Order Issue 3).
 *
 * accountStatus is the single source of truth. A "restricted" customer keeps
 * their session and full read access (catalog, own prices, cart contents,
 * orders, receipts of dispatched orders, ledger, profile) but cannot mutate
 * the cart or place orders. This is a commercial hold, not a ban.
 */

export const ACCOUNT_RESTRICTED_MESSAGE = "Account restricted.";

export type AccountStatus = "active" | "restricted";

type UserStatusFields = {
  accountStatus?: string;
  isActive?: boolean;
};

/**
 * Resolves the effective status, mapping legacy documents (pure — unit-tested):
 * - explicit accountStatus wins;
 * - documents written before the migration have no accountStatus — a legacy
 *   soft-disable (isActive === false) maps to "restricted", everything else
 *   to "active". scripts/migrate-account-status.js persists this same mapping.
 */
export function resolveAccountStatus(user: UserStatusFields | null | undefined): AccountStatus {
  if (!user) return "active";
  if (user.accountStatus === "restricted") return "restricted";
  if (user.accountStatus === "active") return "active";
  return user.isActive === false ? "restricted" : "active";
}

/** Loads the CURRENT effective status from the DB (never from JWT claims). */
export async function getAccountStatus(userId: string): Promise<AccountStatus> {
  if (!isValidObjectId(userId)) {
    return "active";
  }
  await connectDB();
  const user = (await UserModel.findById(userId, { accountStatus: 1, isActive: 1 })
    .lean()
    .exec()) as UserStatusFields | null;
  return resolveAccountStatus(user);
}

/**
 * Loads the CURRENT status from the DB — never trusts JWT claims; the token
 * was issued before the restriction. Throws ACCOUNT_RESTRICTED_MESSAGE
 * (mapped to 403 { code: "ACCOUNT_RESTRICTED" } in routes) when ordering is
 * blocked. Unknown users pass — downstream ownership checks handle them.
 */
export async function requireOrderingEnabled(userId: string): Promise<void> {
  if ((await getAccountStatus(userId)) === "restricted") {
    throw new Error(ACCOUNT_RESTRICTED_MESSAGE);
  }
}
