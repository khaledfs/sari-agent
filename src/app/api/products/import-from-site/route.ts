import { NextResponse } from "next/server";

import { getAuthenticatedUserId } from "@/lib/auth-user";
import { importAllConfiguredCategories, importProductsFromCategory } from "@/services/product-import.service";

function unauthorized() {
  return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
}

export async function POST(req: Request) {
  try {
    // Dev/demo only: never allow scraping in production.
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { success: false, message: "Import is disabled in production." },
        { status: 403 }
      );
    }

    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return unauthorized();
    }

    const body = (await req.json().catch(() => ({}))) as {
      categorySlug?: string;
      importAll?: boolean;
    };

    if (body.importAll === true) {
      const results = await importAllConfiguredCategories({ maxPages: 1 });
      return NextResponse.json({ success: true, data: { results } }, { status: 200 });
    }

    const categorySlug = (body.categorySlug ?? "").trim();
    if (!categorySlug) {
      return NextResponse.json(
        { success: false, message: "Missing categorySlug or importAll." },
        { status: 400 }
      );
    }

    const data = await importProductsFromCategory(categorySlug, { maxPages: 1 });
    const { created, updated, skipped, category } = data;
    return NextResponse.json({ success: true, data: { category, created, updated, skipped } }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to import products.";
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}

