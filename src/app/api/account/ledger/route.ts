import { NextResponse } from "next/server";

import { getAuthenticatedUserId } from "@/lib/auth-user";
import { getAccountByUser, getMockPaymentsByUser } from "@/services/account.service";
import { getMockChecksByUser, getMockInvoicesByUser } from "@/services/financial.service";

function unauthorized() {
  return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
}

export async function GET() {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return unauthorized();
    }

    const account = await getAccountByUser(userId);
    const data = {
      summary: {
        balance: account.balance,
        totalDebt: account.totalDebt,
        lastPaymentDate: account.lastPaymentDate ? account.lastPaymentDate.toISOString() : null,
      },
      payments: getMockPaymentsByUser(userId),
      checks: getMockChecksByUser(userId),
      invoices: getMockInvoicesByUser(userId),
    };

    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load ledger.";
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
