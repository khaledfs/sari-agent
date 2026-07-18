import { NextResponse } from "next/server";

import { resolveActorScope } from "@/lib/actor-scope";
import { mapAdminRouteError } from "@/lib/admin-route-errors";
import { countOpenCollections } from "@/services/collection-tasks.service";

/**
 * Count of open (collectible) tasks in the actor's scope — powers the small
 * nav badge so a new collection is noticed without opening the page.
 */
export async function GET() {
  try {
    const scope = await resolveActorScope();
    const collectible = await countOpenCollections(scope);
    return NextResponse.json({ success: true, data: { collectible } });
  } catch (error) {
    return mapAdminRouteError(error, "Failed to count collections.");
  }
}
