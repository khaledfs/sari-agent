/**
 * Supplied-quantity adjustment rules (warehouse shortage handling).
 *
 * CLIENT-SAFE: pure functions, no server-only imports — the admin UI uses these
 * for the live delta preview and the service uses the SAME functions to compute
 * what it persists, so the previewed total and the stored total can never
 * disagree. All money is rounded to agorot (2dp) the same way as the rest of the
 * app; the ledger correction converts the major-unit delta to integer minor
 * units on the server.
 */

/** Pre-dispatch statuses where a supply adjustment is allowed (Work Order). */
export const ADJUSTABLE_STATUSES = ["pending", "confirmed", "packed"] as const;

/** Blocked once dispatched/delivered/cancelled — the goods are already gone. */
export const ADJUSTMENT_NOT_ALLOWED_CODE = "ADJUSTMENT_NOT_ALLOWED";
export const ADJUSTMENT_NOT_ALLOWED_MESSAGE =
  "This order can no longer be adjusted (it has been dispatched, delivered, or cancelled).";

/** Client sent an out-of-range supplied quantity (→ 400). */
export const ADJUSTMENT_INVALID_CODE = "ADJUSTMENT_INVALID";

/**
 * Free-delivery threshold. Mirrors FREE_DELIVERY_THRESHOLD on the cart page
 * (kept as a local constant to avoid importing cart code — a hard constraint of
 * this task); only used to WARN the admin, never to change pricing.
 */
export const FREE_DELIVERY_THRESHOLD = 500;

export type AdjustableLine = {
  price: number;
  /** Ordered quantity (immutable evidence). */
  quantity: number;
  /** Actually-supplied quantity; absent ⇒ equals `quantity`. */
  suppliedQuantity?: number | null;
  isGift?: boolean;
};

export function isOrderAdjustable(status: string): boolean {
  return (ADJUSTABLE_STATUSES as readonly string[]).includes(String(status ?? "").trim().toLowerCase());
}

/** Supplied quantity for a line, defaulting to the ordered quantity. */
export function suppliedQty(line: { quantity: number; suppliedQuantity?: number | null }): number {
  const s = line.suppliedQuantity;
  return typeof s === "number" && Number.isFinite(s) ? s : line.quantity;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Subtotal from SUPPLIED quantities at the stored snapshot price (gifts are ₪0). */
export function suppliedSubtotal(lines: AdjustableLine[]): number {
  return round2(lines.reduce((sum, l) => sum + l.price * suppliedQty(l), 0));
}

/**
 * Order total recomputed from supplied quantities. The promotion discount is
 * KEPT (a shortage is not the customer's fault — never revoked); the unit price
 * is never recomputed here. Never negative.
 */
export function recomputeOrderTotal(lines: AdjustableLine[], promotionAmountOff = 0): number {
  return Math.max(0, round2(suppliedSubtotal(lines) - (promotionAmountOff || 0)));
}

/** Major-unit credit owed for an adjustment (previous total − new total, ≥ 0). */
export function adjustmentDelta(previousTotal: number, newTotal: number): number {
  return round2(Math.max(0, previousTotal - newTotal));
}

/** Committed-vs-stock shortfall: 0 when stock covers the commitment. */
export function stockShortage(committed: number, stock: number): number {
  return committed > stock ? committed - stock : 0;
}

/**
 * Validates one supplied quantity against its ordered quantity.
 * Decrease-only: 0 ≤ supplied ≤ ordered. Supplying MORE is a new order, not an
 * adjustment — rejected (the route maps this to 400).
 */
export function assertValidSupplied(orderedQty: number, supplied: number): void {
  if (!Number.isInteger(supplied) || supplied < 0) {
    throw new Error("Supplied quantity must be a non-negative whole number.");
  }
  if (supplied > orderedQty) {
    throw new Error("Supplied quantity cannot exceed the ordered quantity.");
  }
}

/**
 * Threshold warnings for the admin preview: did this adjustment drop the order
 * under free-delivery, or under a promotion it had earned? Pure — the UI decides
 * how loudly to show it; the adjustment still proceeds (a conscious choice).
 */
export function thresholdWarnings(
  previousSubtotal: number,
  newSubtotal: number,
  hadPromotion: boolean
): { belowFreeDelivery: boolean; promotionAtRisk: boolean } {
  return {
    belowFreeDelivery: previousSubtotal >= FREE_DELIVERY_THRESHOLD && newSubtotal < FREE_DELIVERY_THRESHOLD,
    promotionAtRisk: hadPromotion && newSubtotal < previousSubtotal,
  };
}
