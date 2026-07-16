import { NextResponse } from "next/server";

import { getAuthenticatedUserId } from "@/lib/auth-user";
import { getAccountByUser } from "@/services/account.service";
import { getLedgerSummary } from "@/services/ledger.service";

function unauthorized() {
  return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
}

export async function GET() {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return unauthorized();
    }
    // Financial summary now comes from the REAL ledger (Work Order Issue 8);
    // the former mock payments array and fabricated totalDebt are gone.
    const [account, ledger] = await Promise.all([getAccountByUser(userId), getLedgerSummary(userId)]);
    const data = {
      profile: {
        businessName: account.businessName,
        phoneNumber: account.phoneNumber,
        email: account.email,
      },
      summary: {
        balanceMinor: ledger.currentBalanceMinor,
        currency: ledger.currency,
        lastEntryAt: ledger.lastEntryAt,
      },
    };
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load account.";
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
