import { NextResponse } from "next/server";

import { mapAdminRouteError } from "@/lib/admin-route-errors";

import { createAdminDiscount, listAdminDiscounts } from "@/lib/admin-pricing";


export async function GET() {
  try {
    return NextResponse.json({ success: true, data: await listAdminDiscounts() });
  } catch (error) {
    return mapAdminRouteError(error, "Failed to fetch discounts.");
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    return NextResponse.json({ success: true, data: await createAdminDiscount(body) });
  } catch (error) {
    return mapAdminRouteError(error, "Failed to create discount.");
  }
}
