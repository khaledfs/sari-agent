import { NextResponse } from "next/server";

import { getAuthenticatedUserId } from "@/lib/auth-user";
import { acknowledgeAdjustment } from "@/services/order.service";

/**
 * Customer marks a supply-adjustment as seen (clears the unseen marker on the
 * orders list). Owner-only via the session; fire-and-forget from the order
 * detail page. Never mutates order data beyond the seen timestamp.
 */
export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    const { id } = await context.params;
    await acknowledgeAdjustment(userId, id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, message: "Failed to acknowledge." }, { status: 400 });
  }
}
