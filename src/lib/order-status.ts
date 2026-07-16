/**
 * Canonical order-status vocabulary + receipt availability rule
 * (Work Order Issue 1). CLIENT-SAFE: no server-only imports — this module is
 * the ONE place both the API routes and the React pages read the rule from,
 * so the status list is never duplicated.
 */

/**
 * Canonical order statuses the admin can set. These strings are chosen so the
 * customer-facing timeline (deriveOrderStage in orders/OrderTimeline.tsx) maps
 * each one to exactly one stage: pending→Placed, confirmed→Confirmed,
 * packed→Packed, out_for_delivery→Out for delivery, delivered→Delivered,
 * cancelled→(halted).
 */
export const ADMIN_ORDER_STATUSES = [
  "pending",
  "confirmed",
  "packed",
  "out_for_delivery",
  "delivered",
  "cancelled",
] as const;

export type AdminOrderStatus = (typeof ADMIN_ORDER_STATUSES)[number];

/**
 * Receipt rule: no viewing/printing until the order physically left the
 * warehouse. "out_for_delivery" is this app's dispatched-equivalent status;
 * "delivered" is past dispatch. Everything else — including "cancelled",
 * which never qualifies — is pre-dispatch.
 */
export function isReceiptAvailable(status: string): boolean {
  const s = String(status ?? "").trim().toLowerCase();
  return s === "out_for_delivery" || s === "delivered";
}
