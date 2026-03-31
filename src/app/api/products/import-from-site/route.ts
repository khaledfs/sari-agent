import { NextResponse } from "next/server";

import { getAuthenticatedUserId } from "@/lib/auth-user";
import { importProductsFromSariHassanSite } from "@/services/product-import.service";

function unauthorized() {
  return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
}

export async function POST() {
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

    // Controlled scope (easy to expand later):
    // Add more categories here when ready.
    const data = await importProductsFromSariHassanSite({
      categories: [{ url: "https://sarihassan.com/product-category/flours/", category: "flours" }],
      maxPagesPerCategory: 1,
    });

    const { created, updated, skipped } = data;
    return NextResponse.json({ success: true, data: { created, updated, skipped } }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to import products.";
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}

