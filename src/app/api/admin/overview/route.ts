import { NextResponse } from "next/server";

import { mapAdminRouteError } from "@/lib/admin-route-errors";

import { getAdminOverview } from "@/services/admin-overview.service";

export async function GET() {
  try {
    const data = await getAdminOverview();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return mapAdminRouteError(error, "Failed to fetch overview.");
  }
}
