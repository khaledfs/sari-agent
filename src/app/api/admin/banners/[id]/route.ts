import { NextResponse } from "next/server";

import { updateAdminBanner } from "@/lib/admin-banners";

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    return NextResponse.json({ success: true, data: await updateAdminBanner(id, body) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update banner.";
    const status =
      message === "Not authenticated." || message === "Access denied."
        ? 401
        : message === "Banner not found."
          ? 404
          : 400;
    return NextResponse.json({ success: false, message }, { status });
  }
}
