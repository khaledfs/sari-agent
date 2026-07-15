import { NextResponse } from "next/server";

import { updateAdminPromotion } from "@/lib/admin-promotions";

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    return NextResponse.json({ success: true, data: await updateAdminPromotion(id, body) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update promotion.";
    const status =
      message === "Not authenticated." || message === "Access denied."
        ? 401
        : message === "Promotion not found."
          ? 404
          : 400;
    return NextResponse.json({ success: false, message }, { status });
  }
}
