import { NextResponse } from "next/server";

import { markOrderPaidByIntent, markOrderPaymentFailedByIntent } from "@/services/order.service";
import {
  handleWebhook,
  isPaymentsEnabled,
  PAYMENTS_DISABLED_CODE,
  PAYMENTS_DISABLED_MESSAGE,
  WEBHOOK_SIGNATURE_HEADER,
} from "@/services/payments.service";

/**
 * Provider payment webhook — the ONLY place a card payment becomes `paid`.
 * No user auth: the signature IS the authentication. The handler verifies the
 * signature, is idempotent per intent id, tolerates replays/out-of-order
 * deliveries, and compares the amount against the order's stored total (never
 * trusts the event amount). A client callback/redirect can never mark paid.
 */
export async function POST(req: Request) {
  if (!isPaymentsEnabled()) {
    return NextResponse.json({ success: false, message: PAYMENTS_DISABLED_MESSAGE, code: PAYMENTS_DISABLED_CODE }, { status: 503 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get(WEBHOOK_SIGNATURE_HEADER) ?? "";

  let event;
  try {
    event = handleWebhook(rawBody, signature); // throws on invalid signature
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid webhook.";
    return NextResponse.json({ success: false, message }, { status: 400 }); // security boundary
  }

  if (event.status === "paid") {
    const result = await markOrderPaidByIntent(event.intentId, event.amountMinor);
    if (!result.ok && result.code === "AMOUNT_MISMATCH") {
      // A paid amount that doesn't match the order total is suspicious — reject.
      return NextResponse.json({ success: false, code: "AMOUNT_MISMATCH" }, { status: 400 });
    }
    // not-found / already-paid → 200 so the provider stops retrying (idempotent).
    return NextResponse.json({ received: true });
  }

  if (event.status === "failed") {
    await markOrderPaymentFailedByIntent(event.intentId);
  }
  return NextResponse.json({ received: true });
}
