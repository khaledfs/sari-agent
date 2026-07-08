import { NextResponse } from "next/server";

import { listAdminOrders } from "@/lib/admin-orders";

export async function GET() {
  try {
    const data = await listAdminOrders();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch orders.";
    const status = message === "Not authenticated." || message === "Access denied." ? 401 : 400;
    return NextResponse.json({ success: false, message }, { status });
  }
}
