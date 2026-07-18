import { NextResponse } from "next/server";

import { resolveActorScope } from "@/lib/actor-scope";
import { mapAdminRouteError } from "@/lib/admin-route-errors";
import {
  COLLECTION_CHEQUE_MESSAGE,
  COLLECTION_OVERPAY_MESSAGE,
  COLLECTION_PAYMENT_INVALID_CODE,
  recordCollectionPayment,
} from "@/services/collection-tasks.service";

/**
 * Agent/admin records a collection payment for a task → the SINGLE unified money
 * path (`recordCollectionPayment`): one order-anchored ledger `payment`,
 * overpay-guarded, settling the task when fully paid. Amount defaults to the
 * outstanding but a partial (≤ outstanding) is allowed; cash or cheque with
 * metadata. Cross-scope task → 404.
 */
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const scope = await resolveActorScope();
    const { id } = await context.params;
    const body = (await req.json().catch(() => ({}))) as {
      amountMinor?: unknown;
      method?: unknown;
      chequeNumber?: unknown;
      chequeDate?: unknown;
      chequeBank?: unknown;
      note?: unknown;
    };
    const data = await recordCollectionPayment(scope, id, {
      amountMinor: typeof body.amountMinor === "number" ? body.amountMinor : undefined,
      method: body.method === "cheque" ? "cheque" : "cash",
      chequeNumber: typeof body.chequeNumber === "string" ? body.chequeNumber : undefined,
      chequeDate: typeof body.chequeDate === "string" ? body.chequeDate : undefined,
      chequeBank: typeof body.chequeBank === "string" ? body.chequeBank : undefined,
      note: typeof body.note === "string" ? body.note : undefined,
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (
      message === COLLECTION_OVERPAY_MESSAGE ||
      message === COLLECTION_CHEQUE_MESSAGE ||
      message.includes("positive whole number")
    ) {
      return NextResponse.json({ success: false, message, code: COLLECTION_PAYMENT_INVALID_CODE }, { status: 400 });
    }
    return mapAdminRouteError(error, "Failed to record collection.");
  }
}
