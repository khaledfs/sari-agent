import { NextResponse } from "next/server";

import { mapAdminRouteError } from "@/lib/admin-route-errors";
import { createAdminAgent, listAdminAgents } from "@/lib/admin-agents";

export async function GET() {
  try {
    const data = await listAdminAgents();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return mapAdminRouteError(error, "Failed to load agents.");
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const data = await createAdminAgent(body);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return mapAdminRouteError(error, "Failed to create agent.");
  }
}
