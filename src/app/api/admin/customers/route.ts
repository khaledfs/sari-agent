import { NextResponse } from "next/server";

import { listAdminCustomers } from "@/lib/admin-customers";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const data = await listAdminCustomers({
      search: url.searchParams.get("search") ?? undefined,
      businessType: url.searchParams.get("businessType") ?? undefined,
      active: url.searchParams.get("active") ?? undefined,
      page: Number(url.searchParams.get("page") ?? "1") || 1,
      pageSize: Number(url.searchParams.get("pageSize") ?? "") || undefined,
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch customers.";
    const status = message === "Not authenticated." || message === "Access denied." ? 401 : 400;
    return NextResponse.json({ success: false, message }, { status });
  }
}
