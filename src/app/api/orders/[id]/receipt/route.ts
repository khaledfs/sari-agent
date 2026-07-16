import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { verifyAuthToken } from "@/lib/jwt";
import { getOrderReceipt, RECEIPT_NOT_AVAILABLE_MESSAGE } from "@/services/order.service";
import type { JwtPayload } from "@/types/session";

/**
 * Receipt data for an eligible (dispatched) order — Work Order Issue 1.
 * 401 unauth · 404 unknown/not-owned (no existence leak) ·
 * 403 { code: "RECEIPT_NOT_AVAILABLE" } pre-dispatch or cancelled.
 */
export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  let payload: JwtPayload;
  try {
    const store = await cookies();
    const token = store.get("authToken")?.value;
    if (!token) throw new Error("Not authenticated.");
    payload = verifyAuthToken(token);
  } catch {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const data = await getOrderReceipt(payload.userId, payload.role, id);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load receipt.";
    if (message === RECEIPT_NOT_AVAILABLE_MESSAGE) {
      return NextResponse.json(
        { success: false, message, code: "RECEIPT_NOT_AVAILABLE" },
        { status: 403 }
      );
    }
    if (message === "Order not found.") {
      return NextResponse.json({ success: false, message }, { status: 404 });
    }
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
