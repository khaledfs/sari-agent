import { NextResponse } from "next/server";

import { getAdminOverview } from "@/services/admin-overview.service";

export async function GET() {
  try {
    const data = await getAdminOverview();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch overview.";
    const status = message === "Not authenticated." || message === "Access denied." ? 401 : 400;
    return NextResponse.json({ success: false, message }, { status });
  }
}
