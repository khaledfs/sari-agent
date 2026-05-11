import { NextResponse } from "next/server";

import { listAdminOrders } from "@/lib/admin-orders";

function authError(msg: string) {
  return msg === "Not authenticated." || msg === "Access denied.";
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get("status") ?? undefined;
    const data = await listAdminOrders(status);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load orders.";
    return NextResponse.json({ success: false, message }, { status: authError(message) ? 401 : 400 });
  }
}
