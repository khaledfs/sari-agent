import { NextResponse } from "next/server";

import { getAdminCustomer, updateAdminCustomer } from "@/lib/admin-customers";

function statusForError(message: string): number {
  if (message === "Not authenticated." || message === "Access denied.") return 401;
  if (message === "Customer not found.") return 404;
  return 400;
}

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return NextResponse.json({ success: true, data: await getAdminCustomer(id) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch customer.";
    return NextResponse.json({ success: false, message }, { status: statusForError(message) });
  }
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    return NextResponse.json({ success: true, data: await updateAdminCustomer(id, body) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update customer.";
    return NextResponse.json({ success: false, message }, { status: statusForError(message) });
  }
}
