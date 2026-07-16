import { NextResponse } from "next/server";

import { mapAdminRouteError } from "@/lib/admin-route-errors";

import { getAdminCustomer, updateAdminCustomer } from "@/lib/admin-customers";


export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return NextResponse.json({ success: true, data: await getAdminCustomer(id) });
  } catch (error) {
    return mapAdminRouteError(error, "Failed to fetch customer.");
  }
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    return NextResponse.json({ success: true, data: await updateAdminCustomer(id, body) });
  } catch (error) {
    return mapAdminRouteError(error, "Failed to update customer.");
  }
}
