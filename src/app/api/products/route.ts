import { NextResponse } from "next/server";

import { getAuthenticatedUserId } from "@/lib/auth-user";
import { applyCustomerPricesToProducts } from "@/services/pricing-presentation.service";
import { createProduct, getAllProducts, getProductsByCategory } from "@/services/product.service";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const category = url.searchParams.get("category")?.trim() ?? "";
    const products = category ? await getProductsByCategory(category) : await getAllProducts();
    // Per-customer pricing (no-op base prices when unauthenticated / no rules).
    const userId = await getAuthenticatedUserId();
    const priced = await applyCustomerPricesToProducts(products, userId);
    return NextResponse.json({ success: true, data: priced });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch products.";
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const product = await createProduct(body);
    return NextResponse.json({ success: true, data: product });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create product.";
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}

