import { NextResponse } from "next/server";

import { resolveActorScope } from "@/lib/actor-scope";
import { mapAdminRouteError } from "@/lib/admin-route-errors";
import { listCollectionsView } from "@/services/collection-tasks.service";

/**
 * Cash/cheque collections for the console actor: an agent sees only their own
 * customers' agent-paid orders (scope resolver), an admin sees all. Each row is
 * either "collectible" (an open task exists) or "pending" (order not yet
 * approved). Oldest-first. Read-only.
 */
export async function GET() {
  try {
    const scope = await resolveActorScope();
    const data = await listCollectionsView(scope);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return mapAdminRouteError(error, "Failed to load collections.");
  }
}
