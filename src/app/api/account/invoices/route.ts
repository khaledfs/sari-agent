import { NextResponse } from "next/server";

import { getAuthenticatedUserId } from "@/lib/auth-user";
import { getMockInvoicesByUser } from "@/services/financial.service";

function unauthorized() {
  return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
}

export async function GET() {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return unauthorized();
    }
    const invoices = getMockInvoicesByUser(userId);
    return NextResponse.json({ success: true, data: { invoices } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load invoices.";
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
