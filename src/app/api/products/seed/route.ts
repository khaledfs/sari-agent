import { NextResponse } from "next/server";

import { seedMockProducts } from "@/services/product.service";

export async function POST() {
  try {
    const result = await seedMockProducts();
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to seed products.";
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}

