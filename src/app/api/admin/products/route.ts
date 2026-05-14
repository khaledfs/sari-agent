import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth-user";
import { connectDB } from "@/lib/db";
import { ProductModel } from "@/models/product.model";

function authError(msg: string) {
  return msg === "Not authenticated." || msg === "Access denied.";
}

export async function GET() {
  try {
    await requireAdmin();
    await connectDB();
    const products = await ProductModel.find({})
      .sort({ isActive: -1, name: 1 })
      .lean()
      .exec();
    return NextResponse.json({ success: true, data: products });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load products.";
    return NextResponse.json({ success: false, message }, { status: authError(message) ? 401 : 400 });
  }
}
