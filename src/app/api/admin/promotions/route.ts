import { NextResponse } from "next/server";

import { mapAdminRouteError } from "@/lib/admin-route-errors";

import { createAdminPromotion, listAdminPromotions } from "@/lib/admin-promotions";


export async function GET() {
  try {
    return NextResponse.json({ success: true, data: await listAdminPromotions() });
  } catch (error) {
    return mapAdminRouteError(error, "Failed to fetch promotions.");
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    return NextResponse.json({ success: true, data: await createAdminPromotion(body) });
  } catch (error) {
    return mapAdminRouteError(error, "Failed to create promotion.");
  }
}
