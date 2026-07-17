import { NextResponse } from "next/server";

import { adjustOrderSupply, type SupplyAdjustmentInput } from "@/lib/admin-orders";
import { mapAdminRouteError } from "@/lib/admin-route-errors";
import {
  ADJUSTMENT_INVALID_CODE,
  ADJUSTMENT_NOT_ALLOWED_CODE,
  ADJUSTMENT_NOT_ALLOWED_MESSAGE,
} from "@/lib/order-adjustment";

/**
 * Adjust supplied quantities on an order's lines (admin or the buyer's agent).
 * Decrease-only; pre-dispatch only. Adjustment-specific outcomes:
 *   403 { code: ADJUSTMENT_NOT_ALLOWED } — dispatched/delivered/cancelled;
 *   400 { code: ADJUSTMENT_INVALID }     — supplied > ordered or malformed.
 * Scope/auth outcomes go through the shared console error mapper (404/403/401).
 */
export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = (await req.json().catch(() => ({}))) as { lines?: SupplyAdjustmentInput[] };
    const lines = Array.isArray(body.lines) ? body.lines : [];
    const data = await adjustOrderSupply(id, lines);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === ADJUSTMENT_NOT_ALLOWED_MESSAGE) {
      return NextResponse.json(
        { success: false, message, code: ADJUSTMENT_NOT_ALLOWED_CODE },
        { status: 403 }
      );
    }
    if (
      message.includes("exceed the ordered quantity") ||
      message.includes("non-negative whole number") ||
      message.includes("Gift lines cannot be adjusted") ||
      message.includes("line that does not exist") ||
      message === "No adjustments provided."
    ) {
      return NextResponse.json({ success: false, message, code: ADJUSTMENT_INVALID_CODE }, { status: 400 });
    }
    return mapAdminRouteError(error, "Failed to adjust order.");
  }
}
