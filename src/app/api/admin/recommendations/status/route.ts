import { NextResponse } from "next/server";

import { mapAdminRouteError } from "@/lib/admin-route-errors";

import { requireAdmin } from "@/lib/auth-user";
import { getRecommendationModelStatus } from "@/services/recommendation-model.service";

/** Admin-only status surface for recommendation artifact/schema health. */
export async function GET() {
  try {
    await requireAdmin();
    const status = getRecommendationModelStatus();
    return NextResponse.json({ success: true, data: status });
  } catch (error) {
    return mapAdminRouteError(error, "Failed to load status.");
  }
}
