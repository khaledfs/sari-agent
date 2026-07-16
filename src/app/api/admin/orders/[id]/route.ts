import { NextResponse } from "next/server";

import { mapAdminRouteError } from "@/lib/admin-route-errors";

import { getAdminOrderDetail, updateAdminOrderStatus } from "@/lib/admin-orders";

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const data = await getAdminOrderDetail(id);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return mapAdminRouteError(error, "Failed to load order.");
  }
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = (await req.json().catch(() => ({}))) as { status?: string };
    const data = await updateAdminOrderStatus(id, body.status ?? "");
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return mapAdminRouteError(error, "Failed to update order.");
  }
}
