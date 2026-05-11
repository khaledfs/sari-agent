import { NextResponse } from "next/server";

import { setAdminOrderStatus } from "@/lib/admin-orders";

function authError(msg: string) {
  return msg === "Not authenticated." || msg === "Access denied.";
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = (await req.json()) as { status?: string };
    if (!body.status) {
      return NextResponse.json({ success: false, message: "status is required." }, { status: 400 });
    }
    await setAdminOrderStatus(id, body.status);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update order.";
    return NextResponse.json({ success: false, message }, { status: authError(message) ? 401 : 400 });
  }
}
