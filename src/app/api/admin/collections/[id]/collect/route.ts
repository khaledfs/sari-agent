import { NextResponse } from "next/server";

import { resolveActorScope } from "@/lib/actor-scope";
import { mapAdminRouteError } from "@/lib/admin-route-errors";
import { markCollectionCollected } from "@/services/collection-tasks.service";

/**
 * Agent/admin marks a collection collected → posts the ledger payment (actor
 * recorded) via the shared path. Cross-scope task → 404 (no leak). The amount
 * comes from the task server-side, never the request.
 */
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const scope = await resolveActorScope();
    const { id } = await context.params;
    const body = (await req.json().catch(() => ({}))) as { note?: unknown };
    const note = typeof body.note === "string" ? body.note : undefined;
    const data = await markCollectionCollected(scope, id, note);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return mapAdminRouteError(error, "Failed to record collection.");
  }
}
