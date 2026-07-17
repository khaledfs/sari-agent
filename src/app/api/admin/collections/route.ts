import { NextResponse } from "next/server";

import { resolveActorScope } from "@/lib/actor-scope";
import { mapAdminRouteError } from "@/lib/admin-route-errors";
import { listOpenCollections } from "@/services/collection-tasks.service";

/**
 * Open cash/cheque collections for the console actor: an agent sees only their
 * own customers' tasks (scope resolver), an admin sees all. Read-only.
 */
export async function GET() {
  try {
    const scope = await resolveActorScope();
    const data = await listOpenCollections(scope);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return mapAdminRouteError(error, "Failed to load collections.");
  }
}
