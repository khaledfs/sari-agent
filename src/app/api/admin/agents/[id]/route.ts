import { NextResponse } from "next/server";

import { mapAdminRouteError } from "@/lib/admin-route-errors";
import { removeAdminAgent } from "@/lib/admin-agents";

/**
 * DELETE = soft-remove (fire) an agent. The reassignment choice rides in the
 * JSON body: `reassignToAgentId` = another active agent's id to hand the
 * customers + open collection tasks to, or null/omitted to unassign them.
 * Not a hard delete — the agent's history is preserved server-side.
 */
export async function DELETE(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = (await req.json().catch(() => ({}))) as { reassignToAgentId?: string | null };
    const data = await removeAdminAgent(id, { reassignToAgentId: body.reassignToAgentId ?? null });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return mapAdminRouteError(error, "Failed to remove agent.");
  }
}
