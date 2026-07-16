import { NextResponse } from "next/server";

import { mapAdminRouteError } from "@/lib/admin-route-errors";

import { getOrdersReport } from "@/lib/admin-reports";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      from?: string;
      to?: string;
      customerId?: string;
      status?: string;
    };
    const result = await getOrdersReport({
      from: body.from,
      to: body.to,
      customerId: body.customerId,
      status: body.status,
    });
    return NextResponse.json({
      success: true,
      data: result.rows,
      meta: { count: result.count, from: body.from ?? "", to: body.to ?? "", hasMore: result.hasMore },
    });
  } catch (error) {
    return mapAdminRouteError(error, "Failed to build the report.");
  }
}
