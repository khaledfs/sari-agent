import { NextResponse } from "next/server";

import { mapAdminRouteError } from "@/lib/admin-route-errors";
import { getStockShortages } from "@/lib/admin-products";

/**
 * Warehouse shortage alert: products where the quantity committed across open
 * pre-dispatch orders exceeds current stock. Admin-only (agents get 403 via the
 * shared mapper). Read-only aggregation.
 */
export async function GET() {
  try {
    const data = await getStockShortages();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return mapAdminRouteError(error, "Failed to load shortages.");
  }
}
