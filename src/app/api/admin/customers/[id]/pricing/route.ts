import { NextResponse } from "next/server";

import { mapAdminRouteError } from "@/lib/admin-route-errors";

import { getCustomerPricingSummary } from "@/lib/admin-pricing";

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return NextResponse.json({ success: true, data: await getCustomerPricingSummary(id) });
  } catch (error) {
    return mapAdminRouteError(error, "Failed to fetch customer pricing.");
  }
}
