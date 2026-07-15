import { NextResponse } from "next/server";

import { createAdminPromotion, listAdminPromotions } from "@/lib/admin-promotions";

function statusForError(message: string): number {
  if (message === "Not authenticated." || message === "Access denied.") return 401;
  if (message === "Promotion not found.") return 404;
  return 400;
}

export async function GET() {
  try {
    return NextResponse.json({ success: true, data: await listAdminPromotions() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch promotions.";
    return NextResponse.json({ success: false, message }, { status: statusForError(message) });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    return NextResponse.json({ success: true, data: await createAdminPromotion(body) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create promotion.";
    return NextResponse.json({ success: false, message }, { status: statusForError(message) });
  }
}
