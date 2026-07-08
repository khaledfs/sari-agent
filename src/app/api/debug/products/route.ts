import { NextResponse } from "next/server";

import { connectDB } from "@/lib/db";
import { ProductModel } from "@/models/product.model";

export async function GET() {
  try {
    await connectDB();
    const total = await ProductModel.countDocuments({});
    const products = await ProductModel.find({})
      .select("name sku category isActive")
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    return NextResponse.json(
      {
        success: true,
        data: {
          total,
          products: products.map((p) => ({
            name: p.name ?? "",
            sku: p.sku ?? "",
            category: p.category ?? "",
            isActive: Boolean(p.isActive),
          })),
        },
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load debug products.";
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}

