import { NextResponse } from "next/server";

import { mapAdminRouteError } from "@/lib/admin-route-errors";
import { getConsoleIdentity } from "@/lib/admin-agents";

/** Console identity: role + name + (for agents) assigned-customer count. */
export async function GET() {
  try {
    const data = await getConsoleIdentity();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return mapAdminRouteError(error, "Failed to load identity.");
  }
}
