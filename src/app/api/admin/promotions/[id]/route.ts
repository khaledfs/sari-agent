import { NextResponse } from "next/server";

import { mapAdminRouteError } from "@/lib/admin-route-errors";

import { updateAdminPromotion } from "@/lib/admin-promotions";

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    return NextResponse.json({ success: true, data: await updateAdminPromotion(id, body) });
  } catch (error) {
    return mapAdminRouteError(error, "Failed to update promotion.");
  }
}
