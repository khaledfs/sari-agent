import { NextResponse } from "next/server";

import { getAuthenticatedUserId } from "@/lib/auth-user";
import { getAccountByUser, getMockPaymentsByUser } from "@/services/account.service";

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
    const payments = getMockPaymentsByUser(userId);
    const data = {
      profile: {
        businessName: account.businessName,
        phoneNumber: account.phoneNumber,
        email: account.email,
      },
      summary: {
        balance: account.balance,
        totalDebt: account.totalDebt,
        lastPaymentDate: account.lastPaymentDate ? account.lastPaymentDate.toISOString() : null,
      },
      payments,
    };
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load account.";
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
