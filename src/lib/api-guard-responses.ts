import { NextResponse } from "next/server";

import { ACCOUNT_RESTRICTED_MESSAGE } from "@/services/account-status.service";

/**
 * Maps the ordering-permission guard error to its stable API contract:
 * 403 { success: false, code: "ACCOUNT_RESTRICTED" }. Returns null for any
 * other error so routes keep their existing mapping.
 */
export function mapAccountRestrictedError(error: unknown): NextResponse | null {
  if (error instanceof Error && error.message === ACCOUNT_RESTRICTED_MESSAGE) {
    return NextResponse.json(
      { success: false, message: ACCOUNT_RESTRICTED_MESSAGE, code: "ACCOUNT_RESTRICTED" },
      { status: 403 }
    );
  }
  return null;
}
