import { NextResponse } from "next/server";

import { createAdminBanner, listAdminBanners } from "@/lib/admin-banners";

function statusForError(message: string): number {
  if (message === "Not authenticated." || message === "Access denied.") return 401;
  if (message === "Banner not found.") return 404;
  return 400;
}

export async function GET() {
  try {
    return NextResponse.json({ success: true, data: await listAdminBanners() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch banners.";
    return NextResponse.json({ success: false, message }, { status: statusForError(message) });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    return NextResponse.json({ success: true, data: await createAdminBanner(body) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create banner.";
    return NextResponse.json({ success: false, message }, { status: statusForError(message) });
  }
}
