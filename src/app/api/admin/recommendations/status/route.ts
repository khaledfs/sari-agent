import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth-user";
import { getRecommendationModelStatus } from "@/services/recommendation-model.service";

/** Admin-only status surface for recommendation artifact/schema health. */
export async function GET() {
  try {
    await requireAdmin();
    const status = getRecommendationModelStatus();
    return NextResponse.json({ success: true, data: status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load status.";
    const status = message === "Not authenticated." ? 401 : message === "Access denied." ? 403 : 400;
    return NextResponse.json({ success: false, message }, { status });
  }
}
