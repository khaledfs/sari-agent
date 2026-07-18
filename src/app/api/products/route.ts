import { NextResponse } from "next/server";

import { getAuthenticatedUserId } from "@/lib/auth-user";
import { applyCustomerPricesToProducts } from "@/services/pricing-presentation.service";
import { createProduct, listCatalogProducts } from "@/services/product.service";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    // Catalog page comes from the tagged cache; per-customer pricing is
    // applied per request AFTER the cache (never cached cross-customer).
    const catalog = await listCatalogProducts({
      category: url.searchParams.get("category") ?? undefined,
      search: url.searchParams.get("search") ?? undefined,
      page: Number(url.searchParams.get("page") ?? "1") || 1,
      pageSize: Number(url.searchParams.get("pageSize") ?? "") || undefined,
      sort: url.searchParams.get("sort") ?? undefined,
    });
    const userId = await getAuthenticatedUserId();
    const priced = await applyCustomerPricesToProducts(catalog.items, userId);
    return NextResponse.json({
      success: true,
      data: priced,
      meta: {
        page: catalog.page,
        pageSize: catalog.pageSize,
        total: catalog.total,
        totalPages: catalog.totalPages,
      },
    });
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

