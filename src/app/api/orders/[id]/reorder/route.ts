import { NextResponse } from "next/server";

import { getAuthenticatedUserId } from "@/lib/auth-user";
import { reorderOrderToCart } from "@/services/smart-ordering.service";

function unauthorized() {
  return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
}

export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return unauthorized();
  }
  try {
    const { id } = await context.params;
    const data = await reorderOrderToCart(userId, id);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to reorder.";
    if (message === "Order not found.") {
      return NextResponse.json({ success: false, message }, { status: 404 });
    }
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
