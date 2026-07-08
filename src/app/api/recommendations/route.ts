import { NextResponse } from "next/server";

import { getAuthenticatedUserId } from "@/lib/auth-user";
import { getRecommendedProductsByUser } from "@/services/recommendation-model.service";

function unauthorized() {
  return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
}

/**
 * Authenticated customer recommendations (Logistic Regression when `linear_head.json`
 * exists under `artifacts/recommendation-logreg/`, else deterministic Recent+Frequent+Favorites).
 */
export async function GET(req: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return unauthorized();
  }
  try {
    const url = new URL(req.url);
    const limitRaw = url.searchParams.get("limit");
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;
    const result = await getRecommendedProductsByUser(userId, {
      limit: Number.isFinite(limit) ? limit : undefined,
    });
    return NextResponse.json({
      success: true,
      data: result.data,
      meta: {
        mode: result.status.mode,
        reason: result.status.reason,
        schemaVersion: result.status.schemaVersion ?? null,
        trainedAt: result.status.trainedAt ?? null,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load recommendations.";
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
