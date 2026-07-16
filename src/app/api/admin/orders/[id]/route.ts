import { NextResponse } from "next/server";

import { getAdminOrderDetail, updateAdminOrderStatus } from "@/lib/admin-orders";

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const data = await getAdminOrderDetail(id);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load order.";
    const status =
      message === "Not authenticated." || message === "Access denied."
        ? 401
        : message === "Order not found."
          ? 404
          : 400;
    return NextResponse.json({ success: false, message }, { status });
  }
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = (await req.json().catch(() => ({}))) as { status?: string };
    const data = await updateAdminOrderStatus(id, body.status ?? "");
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update order.";
    const status =
      message === "Not authenticated." || message === "Access denied."
        ? 401
        : message === "Order not found."
          ? 404
          : 400;
    return NextResponse.json({ success: false, message }, { status });
  }
}
