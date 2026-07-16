import { NextResponse } from "next/server";

import { resolveActorScope } from "@/lib/actor-scope";
import { mapAdminRouteError } from "@/lib/admin-route-errors";
import { listConsoleThreads } from "@/services/messaging.service";

/** Thread inbox — agents see only their customers' threads; admin sees all. */
export async function GET() {
  try {
    const scope = await resolveActorScope();
    const data = await listConsoleThreads(scope);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return mapAdminRouteError(error, "Failed to load threads.");
  }
}
