import { NextResponse } from "next/server";

import { mapAdminRouteError } from "@/lib/admin-route-errors";
import { z } from "zod";

import { exportRecommendationDatasetToArtifacts } from "@/services/recommendation-export.service";

const bodySchema = z.object({
  maxUsers: z.number().int().positive().optional(),
});

/**
 * Admin-only offline dataset export for ML training (JSONL + feature key list).
 * POST body optional: `{ "maxUsers": 50 }` to cap users (newest first).
 */
export async function POST(req: Request) {
  try {
    let maxUsers: number | undefined;
    try {
      const json = await req.json().catch(() => ({}));
      const parsed = bodySchema.safeParse(json);
      if (parsed.success) {
        maxUsers = parsed.data.maxUsers;
      }
    } catch {
      /* empty body */
    }

    const result = await exportRecommendationDatasetToArtifacts({ maxUsers });
    return NextResponse.json({
      success: true,
      data: {
        ...result,
        note: "For offline training only. Do not expose this endpoint publicly.",
      },
    });
  } catch (error) {
    return mapAdminRouteError(error, "Export failed.");
  }
}
