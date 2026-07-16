import { NextResponse } from "next/server";

import { mapAdminRouteError } from "@/lib/admin-route-errors";

import { listAdminOrders } from "@/lib/admin-orders";

export async function GET() {
  try {
    const data = await listAdminOrders();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return mapAdminRouteError(error, "Failed to fetch orders.");
  }
}
