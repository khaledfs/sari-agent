import { NextResponse } from "next/server";

import { getAuthenticatedUserId } from "@/lib/auth-user";
import { searchCatalog } from "@/services/catalog-search.service";

/**
 * Smart multilingual catalog search. Browsing/pagination stays on
 * GET /api/products — this route is for search only.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const query = (url.searchParams.get("query") ?? url.searchParams.get("q") ?? "").trim();
    if (!query) {
      return NextResponse.json({ success: false, message: "query is required." }, { status: 400 });
    }

    const numberParam = (name: string): number | undefined => {
      const raw = url.searchParams.get(name);
      if (raw === null || raw.trim() === "") return undefined;
      const n = Number(raw);
      return Number.isFinite(n) ? n : undefined;
    };

    const userId = await getAuthenticatedUserId();
    const data = await searchCatalog({
      query,
      filters: {
        category: url.searchParams.get("category") ?? undefined,
        minPrice: numberParam("minPrice"),
        maxPrice: numberParam("maxPrice"),
        inStockOnly: url.searchParams.get("inStockOnly") === "true",
      },
      page: Number(url.searchParams.get("page") ?? "1") || 1,
      pageSize: numberParam("pageSize"),
      userId,
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Search failed.";
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
