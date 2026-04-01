import { NextResponse } from "next/server";

import { createProduct, getAllProducts, getProductsByCategory } from "@/services/product.service";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const category = url.searchParams.get("category")?.trim() ?? "";
    const products = category ? await getProductsByCategory(category) : await getAllProducts();
    return NextResponse.json({ success: true, data: products });
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

