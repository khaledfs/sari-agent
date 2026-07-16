import { NextResponse } from "next/server";

import { mapAdminRouteError } from "@/lib/admin-route-errors";

import { updateAdminProduct } from "@/lib/admin-products";

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const data = await updateAdminProduct(id, body);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return mapAdminRouteError(error, "Failed to update product.");
  }
}
