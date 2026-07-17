import { isValidObjectId } from "mongoose";
import { NextResponse } from "next/server";

import { getAuthenticatedUserId } from "@/lib/auth-user";
import { OrderModel } from "@/models/order.model";
import { markOrderPaidByIntent, markOrderPaymentFailedByIntent } from "@/services/order.service";
import { toMinorUnits } from "@/services/ledger.service";
import { handleWebhook, isMockAdapterActive, isPaymentsEnabled, signMockWebhookPayload } from "@/services/payments.service";

/**
 * DEV + MOCK ONLY: simulates the provider POSTing a SIGNED webhook for the
 * caller's own card order, so the card flow is demoable without a real provider.
 * It does NOT bypass the security model — it builds a payload, signs it with the
 * mock secret, and feeds it through the exact same verify-then-apply path as a
 * real webhook. Returns 404 whenever the mock isn't the active adapter (prod).
 */
export async function POST(req: Request) {
  if (!isPaymentsEnabled() || !isMockAdapterActive()) {
    return NextResponse.json({ success: false, message: "Not available." }, { status: 404 });
  }
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { orderId?: unknown; outcome?: unknown };
  const orderId = typeof body.orderId === "string" ? body.orderId : "";
  const outcome = body.outcome === "failed" ? "failed" : "paid";
  if (!isValidObjectId(orderId)) {
    return NextResponse.json({ success: false, message: "Order not found." }, { status: 404 });
  }

  const order = (await OrderModel.findById(orderId).lean().exec()) as
    | { _id: unknown; userId: unknown; total: number; paymentIntentId?: string; paymentMethod?: string }
    | null;
  // Ownership + card-order guard (no existence leak beyond own orders).
  if (!order || String(order.userId) !== userId || order.paymentMethod !== "card" || !order.paymentIntentId) {
    return NextResponse.json({ success: false, message: "Order not found." }, { status: 404 });
  }

  const payload = JSON.stringify({
    intentId: order.paymentIntentId,
    status: outcome,
    amountMinor: toMinorUnits(order.total),
  });
  const signature = signMockWebhookPayload(payload);
  const event = handleWebhook(payload, signature); // same verified path as the real webhook

  if (event.status === "paid") {
    await markOrderPaidByIntent(event.intentId, event.amountMinor);
  } else {
    await markOrderPaymentFailedByIntent(event.intentId);
  }
  return NextResponse.json({ success: true, data: { outcome } });
}
