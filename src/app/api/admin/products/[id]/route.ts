import { NextResponse } from "next/server";

import { updateAdminProduct } from "@/lib/admin-products";

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const data = await updateAdminProduct(id, body);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update product.";
    const status =
      message === "Not authenticated." || message === "Access denied."
        ? 401
        : message === "Product not found."
          ? 404
          : 400;
    return NextResponse.json({ success: false, message }, { status });
  }
}
