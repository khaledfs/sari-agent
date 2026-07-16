import { NextResponse } from "next/server";

import { buildReportCsv, REPORT_TYPES, type ReportType } from "@/lib/admin-reports";

/**
 * CSV export: GET /api/admin/reports/[type]/export?from=&to=&format=csv
 * Starts with a UTF-8 BOM so Excel renders Hebrew/Arabic correctly.
 * Datasets are capped at 500 rows by the service, so a single string body is
 * well within memory limits (no streaming needed at this size).
 */
export async function GET(req: Request, context: { params: Promise<{ type: string }> }) {
  try {
    const { type } = await context.params;
    if (!(REPORT_TYPES as readonly string[]).includes(type)) {
      return NextResponse.json({ success: false, message: "Unknown report type." }, { status: 404 });
    }
    const url = new URL(req.url);
    const format = url.searchParams.get("format") ?? "csv";
    if (format !== "csv") {
      return NextResponse.json({ success: false, message: "Only csv format is supported." }, { status: 400 });
    }

    const csv = await buildReportCsv(
      type as ReportType,
      url.searchParams.get("from"),
      url.searchParams.get("to")
    );

    const date = new Date().toISOString().slice(0, 10);
    // Explicit UTF-8 BOM so Excel decodes Hebrew/Arabic correctly.
    return new NextResponse("﻿" + csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="sari-report-${type}-${date}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to export the report.";
    const status = message === "Not authenticated." || message === "Access denied." ? 401 : 400;
    return NextResponse.json({ success: false, message }, { status });
  }
}
