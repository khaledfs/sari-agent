import { NextResponse } from "next/server";

import { getAuthenticatedUserId } from "@/lib/auth-user";
import { applyCustomerPricesToProducts } from "@/services/pricing-presentation.service";
import { getProductById, updateProduct } from "@/services/product.service";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const product = await getProductById(id);
    // Per-customer pricing (no-op base price when unauthenticated / no rules).
    const userId = await getAuthenticatedUserId();
    const [priced] = await applyCustomerPricesToProducts(
      [product as { _id: unknown; price: number }],
      userId
    );
    return NextResponse.json({ success: true, data: priced });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch product.";
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}

export async function PUT(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await req.json();
    const updated = await updateProduct(id, body);
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update product.";
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}

