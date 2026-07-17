import { NextResponse } from "next/server";

import { getAuthenticatedUserId } from "@/lib/auth-user";
import { mapAccountRestrictedError } from "@/lib/api-guard-responses";
import { createOrderFromCart, getOrdersByUser } from "@/services/order.service";
import { PAYMENTS_DISABLED_CODE, PAYMENTS_DISABLED_MESSAGE } from "@/services/payments.service";

function unauthorized() {
  return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
}

export async function GET() {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return unauthorized();
    }
    const data = await getOrdersByUser(userId);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load orders.";
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}

export async function POST(req: Request) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return unauthorized();
    }
    const body = (await req.json().catch(() => ({}))) as { notes?: unknown; paymentMethod?: unknown };
    const notes = typeof body.notes === "string" ? body.notes : "";
    const paymentMethod = body.paymentMethod === "card" ? "card" : "agent";
    const { order, clientToken } = await createOrderFromCart(userId, { notes, paymentMethod });
    return NextResponse.json({ success: true, data: order, ...(clientToken ? { clientToken } : {}) });
  } catch (error) {
    const restricted = mapAccountRestrictedError(error);
    if (restricted) return restricted;
    const message = error instanceof Error ? error.message : "Failed to create order.";
    if (message === PAYMENTS_DISABLED_MESSAGE) {
      return NextResponse.json({ success: false, message, code: PAYMENTS_DISABLED_CODE }, { status: 503 });
    }
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
