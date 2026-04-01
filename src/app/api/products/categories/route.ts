import { NextResponse } from "next/server";

import { PRODUCT_CATEGORIES } from "@/lib/product-categories";

export async function GET() {
  try {
    const data = PRODUCT_CATEGORIES.map((c) => ({
      slug: c.slug,
      displayName: c.displayName,
      imageUrl: c.imageUrl,
    }));
    return NextResponse.json({ success: true, data }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load categories.";
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}

