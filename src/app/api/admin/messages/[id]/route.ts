import { NextResponse } from "next/server";

import { resolveActorScope } from "@/lib/actor-scope";
import { mapAdminRouteError } from "@/lib/admin-route-errors";
import { getConsoleThread, sendConsoleMessage } from "@/services/messaging.service";

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const scope = await resolveActorScope();
    const { id } = await context.params;
    const url = new URL(req.url);
    const page = Number(url.searchParams.get("page") ?? "1");
    const data = await getConsoleThread(scope, id, Number.isFinite(page) ? page : 1);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return mapAdminRouteError(error, "Failed to load thread.");
  }
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const scope = await resolveActorScope();
    const { id } = await context.params;
    const body = (await req.json().catch(() => ({}))) as { body?: unknown };
    const data = await sendConsoleMessage(scope, id, String(body.body ?? ""));
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return mapAdminRouteError(error, "Failed to send message.");
  }
}
