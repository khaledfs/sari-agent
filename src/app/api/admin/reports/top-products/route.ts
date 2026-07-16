import { NextResponse } from "next/server";

import { mapAdminRouteError } from "@/lib/admin-route-errors";

import { getTopProductsReport } from "@/lib/admin-reports";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { from?: string; to?: string; limit?: number };
    const result = await getTopProductsReport({ from: body.from, to: body.to, limit: body.limit });
    return NextResponse.json({
      success: true,
      data: result.rows,
      meta: { count: result.count, from: body.from ?? "", to: body.to ?? "", hasMore: result.hasMore },
    });
  } catch (error) {
    return mapAdminRouteError(error, "Failed to build the report.");
  }
}
