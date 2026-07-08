import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth-user";
import { buildRecommendationCandidatePoolForUser } from "@/services/recommendation-candidates.service";

/** Admin-only candidate debug surface. */
export async function GET(req: Request) {
  try {
    await requireAdmin();
    const url = new URL(req.url);
    const userId = (url.searchParams.get("userId") ?? "").trim();
    if (!userId) {
      return NextResponse.json({ success: false, message: "userId is required." }, { status: 400 });
    }
    const limitRaw = url.searchParams.get("limit");
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;
    const pool = await buildRecommendationCandidatePoolForUser(userId, {
      limit: Number.isFinite(limit) ? limit : 120,
      explorationLimit: 8,
    });
    return NextResponse.json({
      success: true,
      data: {
        userId: pool.userId,
        generatedAt: pool.generatedAt,
        countsBySource: pool.countsBySource,
        candidateCount: pool.candidates.length,
        candidates: pool.candidates,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load candidates.";
    const status = message === "Not authenticated." ? 401 : message === "Access denied." ? 403 : 400;
    return NextResponse.json({ success: false, message }, { status });
  }
}
