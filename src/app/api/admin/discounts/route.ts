import { NextResponse } from "next/server";

import { createAdminDiscount, listAdminDiscounts } from "@/lib/admin-pricing";

function statusForError(message: string): number {
  if (message === "Not authenticated." || message === "Access denied.") return 401;
  if (message === "Discount not found.") return 404;
  return 400;
}

export async function GET() {
  try {
    return NextResponse.json({ success: true, data: await listAdminDiscounts() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch discounts.";
    return NextResponse.json({ success: false, message }, { status: statusForError(message) });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    return NextResponse.json({ success: true, data: await createAdminDiscount(body) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create discount.";
    return NextResponse.json({ success: false, message }, { status: statusForError(message) });
  }
}
