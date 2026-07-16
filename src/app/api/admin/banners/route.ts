import { NextResponse } from "next/server";

import { mapAdminRouteError } from "@/lib/admin-route-errors";

import { createAdminBanner, listAdminBanners } from "@/lib/admin-banners";


export async function GET() {
  try {
    return NextResponse.json({ success: true, data: await listAdminBanners() });
  } catch (error) {
    return mapAdminRouteError(error, "Failed to fetch banners.");
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    return NextResponse.json({ success: true, data: await createAdminBanner(body) });
  } catch (error) {
    return mapAdminRouteError(error, "Failed to create banner.");
  }
}
