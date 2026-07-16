import { NextResponse } from "next/server";

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
    const message = error instanceof Error ? error.message : "Failed to build the report.";
    const status = message === "Not authenticated." || message === "Access denied." ? 401 : 400;
    return NextResponse.json({ success: false, message }, { status });
  }
}
