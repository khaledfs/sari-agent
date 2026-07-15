import { NextResponse } from "next/server";

import { createAdminProduct, listAdminProducts } from "@/lib/admin-products";

function statusForError(message: string): number {
  if (message === "Not authenticated." || message === "Access denied.") return 401;
  if (message === "Product not found.") return 404;
  return 400;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const data = await listAdminProducts({
      search: url.searchParams.get("search") ?? undefined,
      category: url.searchParams.get("category") ?? undefined,
      active: url.searchParams.get("active") ?? undefined,
      page: Number(url.searchParams.get("page") ?? "1") || 1,
      pageSize: Number(url.searchParams.get("pageSize") ?? "") || undefined,
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch products.";
    return NextResponse.json({ success: false, message }, { status: statusForError(message) });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const data = await createAdminProduct(body);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create product.";
    return NextResponse.json({ success: false, message }, { status: statusForError(message) });
  }
}
